import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeConfig } from '../config';
import { logger } from '../logger';

export interface Session {
  chatId: string;
  claudeSessionId: string;   // Claude Code 内部 session ID
  workDir: string;
  createdAt: number;
  lastActiveAt: number;
}

// Claude Code --output-format json 的输出结构
interface ClaudeJsonOutput {
  type: string;
  subtype?: string;
  session_id?: string;
  result?: string;
  is_error?: boolean;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private dataDir: string;
  private claudeBin: string;
  private defaultWorkDir: string;
  private sessionsFile: string;

  constructor(config: ClaudeConfig, dataDir: string) {
    this.claudeBin = config.bin || 'ept claude';
    this.defaultWorkDir = config.work_dir;
    this.dataDir = dataDir;
    this.sessionsFile = path.join(dataDir, 'sessions.json');

    // 确保数据目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.loadSessions();
  }

  // 向某个 chat 会话发送消息，返回 Claude 的完整回复
  async sendMessage(chatId: string, message: string): Promise<string> {
    const session = this.sessions.get(chatId);

    let args: string[];
    if (session) {
      // 已有会话，使用 --resume 继续
      logger.debug(`[${chatId}] 续接会话 ${session.claudeSessionId}`);
      args = ['--resume', session.claudeSessionId, '--print', '--output-format', 'json', message];
    } else {
      // 新会话
      logger.debug(`[${chatId}] 新建会话`);
      args = ['--print', '--output-format', 'json', message];
    }

    const workDir = session?.workDir || this.defaultWorkDir;
    const { output, exitCode } = await this.runClaude(args, workDir);

    if (exitCode !== 0) {
      throw new Error(`Claude 进程退出异常，exit code: ${exitCode}`);
    }

    // 解析 JSON 输出，提取 session_id 和回复文本
    const { sessionId, resultText } = this.parseOutput(output);

    // 保存/更新会话
    const now = Date.now();
    this.sessions.set(chatId, {
      chatId,
      claudeSessionId: sessionId || session?.claudeSessionId || '',
      workDir,
      createdAt: session?.createdAt || now,
      lastActiveAt: now,
    });
    this.saveSessions();

    return resultText;
  }

  // 删除某个 chat 的会话（/new 命令用）
  deleteSession(chatId: string): boolean {
    const existed = this.sessions.has(chatId);
    this.sessions.delete(chatId);
    this.saveSessions();
    return existed;
  }

  getSession(chatId: string): Session | undefined {
    return this.sessions.get(chatId);
  }

  // 运行 claude 子进程，收集完整 stdout
  private runClaude(args: string[], cwd: string): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      // 支持 "ept claude" 这类带空格的命令，拆分为 executable + 前缀参数
      const binParts = this.claudeBin.trim().split(/\s+/);
      const executable = binParts[0];
      const prefixArgs = binParts.slice(1);
      const fullArgs = [...prefixArgs, ...args];

      logger.debug('执行:', executable, fullArgs.slice(0, 3).join(' '), '...');

      const child = spawn(executable, fullArgs, {
        cwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        reject(new Error(`无法启动进程 "${executable}": ${err.message}\n请确认 bin 配置正确（当前: ${this.claudeBin}）`));
      });

      child.on('close', (code) => {
        if (stderr) {
          logger.debug('claude stderr:', stderr.slice(0, 200));
        }
        resolve({ output: stdout, exitCode: code ?? 1 });
      });
    });
  }

  // 解析 Claude Code JSON 输出，提取 session_id 和最终回复
  private parseOutput(raw: string): { sessionId: string; resultText: string } {
    let sessionId = '';
    let resultText = '';

    // Claude Code 以 NDJSON（每行一个 JSON）输出
    const lines = raw.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const obj: ClaudeJsonOutput = JSON.parse(line);

        // 记录 session_id（通常在 type=system 或 type=result 行里）
        if (obj.session_id) {
          sessionId = obj.session_id;
        }

        // 提取最终回复文本
        if (obj.type === 'result' && obj.subtype === 'success') {
          resultText = obj.result || '';
        }
      } catch {
        // 忽略非 JSON 行
      }
    }

    // 兜底：如果 JSON 解析没拿到文本，直接返回原始输出
    if (!resultText) {
      resultText = raw.trim();
    }

    return { sessionId, resultText };
  }

  private loadSessions(): void {
    if (!fs.existsSync(this.sessionsFile)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.sessionsFile, 'utf-8'));
      for (const session of data) {
        this.sessions.set(session.chatId, session);
      }
      logger.debug(`已加载 ${this.sessions.size} 个历史会话`);
    } catch {
      logger.warn('加载会话文件失败，将重新开始');
    }
  }

  private saveSessions(): void {
    const data = Array.from(this.sessions.values());
    fs.writeFileSync(this.sessionsFile, JSON.stringify(data, null, 2), 'utf-8');
  }
}
