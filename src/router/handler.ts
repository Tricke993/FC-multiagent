import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { FeishuClient, IncomingMessage } from '../feishu/client';
import { SessionManager } from '../claude/session';
import { logger } from '../logger';

export class MessageRouter {
  private feishu: FeishuClient;
  private sessions: SessionManager;
  private botOpenId: string = '';

  // 正在处理中的消息（防止重复触发）
  private processing: Set<string> = new Set();

  // 编排配置（可选）
  private orchestrateScript: string = '';
  private agentsFile: string = '';
  private promptFile: string = '';
  private claudeBin: string = '';

  constructor(
    feishu: FeishuClient,
    sessions: SessionManager,
    orchestration?: {
      orchestrateScript: string;
      agentsFile: string;
      promptFile: string;
      claudeBin: string;
    }
  ) {
    this.feishu = feishu;
    this.sessions = sessions;
    if (orchestration) {
      this.orchestrateScript = orchestration.orchestrateScript;
      this.agentsFile = orchestration.agentsFile;
      this.promptFile = orchestration.promptFile;
      this.claudeBin = orchestration.claudeBin;
    }
  }

  async init(): Promise<void> {
    const info = await this.feishu.getBotInfo();
    this.botOpenId = info.openId;
    logger.info(`Bot 信息: ${info.name} (${info.openId})`);
  }

  start(): void {
    this.feishu.onMessage((msg) => this.handleMessage(msg));
    this.feishu.start();
  }

  private async handleMessage(msg: IncomingMessage): Promise<void> {
    // 防重：同一条消息不重复处理
    if (this.processing.has(msg.messageId)) return;

    const shouldRespond = this.shouldRespond(msg);
    if (!shouldRespond) return;

    this.processing.add(msg.messageId);

    // 内置指令处理
    if (await this.handleCommand(msg)) {
      this.processing.delete(msg.messageId);
      return;
    }

    logger.info(`[${msg.chatId}] 处理消息: ${msg.content.slice(0, 60)}...`);

    // 立即添加"稍等"表情，告知用户正在处理
    const reactionId = await this.feishu.addReaction(msg.messageId, 'OneSecond');

    // 判断是否启用 Orchestrator（需要：有脚本路径 + 有 thread + agents.json 非空）
    if (this.orchestrateScript && msg.threadId && this.hasAgents()) {
      try {
        this.spawnOrchestrator(msg, reactionId);
        logger.info(`[${msg.chatId}] Orchestrator 已启动（thread: ${msg.threadId}）`);
      } catch (err) {
        logger.error('启动 Orchestrator 失败，降级为直接处理:', err);
        // 降级：直接用 Claude 处理
        await this.handleWithClaude(msg, reactionId);
      } finally {
        this.processing.delete(msg.messageId);
      }
    } else {
      // 无 Orchestrator 配置，直接 Claude 处理（原逻辑）
      await this.handleWithClaude(msg, reactionId);
    }
  }

  // 检查 agents.json 是否有可用 Agent
  private hasAgents(): boolean {
    if (!this.agentsFile) return false;
    try {
      const agents = JSON.parse(fs.readFileSync(this.agentsFile, 'utf-8'));
      return Array.isArray(agents.agents) && agents.agents.length > 0;
    } catch {
      return false;
    }
  }

  // 启动 Orchestrator 子进程（detached，FC-CONNECT 不等待）
  private spawnOrchestrator(msg: IncomingMessage, reactionId: string): void {
    const child = spawn('node', [
      this.orchestrateScript,
      '--thread-id', msg.threadId,
      '--chat-id', msg.chatId,
      '--root-id', msg.rootId || msg.messageId,
      '--message-id', msg.messageId,
      '--reaction-id', reactionId,
      '--user-message', msg.content,
      '--agents-file', this.agentsFile,
      '--prompt-file', this.promptFile,
      '--claude-bin', this.claudeBin,
    ], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }

  // 直接用 Claude 处理（原逻辑，无 Agent 或无 thread 时的 fallback）
  private async handleWithClaude(msg: IncomingMessage, reactionId: string): Promise<void> {
    const sessionKey = msg.threadId || msg.chatId;
    try {
      const response = await this.sessions.sendMessage(sessionKey, msg.content);
      if (response.trim()) {
        await this.feishu.replyText(msg.messageId, response);
        logger.info(`[${msg.chatId}] 回复完成，长度: ${response.length}`);
      }
    } catch (err) {
      logger.error(`[${msg.chatId}] 处理失败:`, err);
      await this.feishu.replyText(
        msg.messageId,
        `处理出错：${err instanceof Error ? err.message : String(err)}`
      ).catch(() => {});
    } finally {
      await this.feishu.deleteReaction(msg.messageId, reactionId);
      this.processing.delete(msg.messageId);
    }
  }

  // 判断是否需要响应这条消息
  private shouldRespond(msg: IncomingMessage): boolean {
    // 私聊：直接响应
    if (msg.chatType === 'p2p') return true;

    // 群聊：只响应 @了本 Bot 的消息
    const mentioned = msg.mentions.some(m => m.id === this.botOpenId);
    return mentioned;
  }

  // 处理内置斜杠指令，返回 true 表示已处理
  private async handleCommand(msg: IncomingMessage): Promise<boolean> {
    const text = msg.content.trim();
    const sessionKey = msg.threadId || msg.chatId;

    if (text === '/new') {
      this.sessions.deleteSession(sessionKey);
      await this.feishu.replyText(msg.messageId, '已开始新会话。');
      return true;
    }

    if (text === '/status') {
      const session = this.sessions.getSession(sessionKey);
      if (session) {
        const since = Math.round((Date.now() - session.createdAt) / 60000);
        await this.feishu.replyText(
          msg.messageId,
          `当前会话已运行 ${since} 分钟，Session ID: ${session.claudeSessionId.slice(0, 8)}...`
        );
      } else {
        await this.feishu.replyText(msg.messageId, '暂无活跃会话。');
      }
      return true;
    }

    if (text === '/help') {
      const help = [
        'FC-CONNECT 指令：',
        '/new     - 开始新会话',
        '/status  - 查看当前会话状态',
        '/help    - 显示此帮助',
      ].join('\n');
      await this.feishu.replyText(msg.messageId, help);
      return true;
    }

    return false;
  }
}
