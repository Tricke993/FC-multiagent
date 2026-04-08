#!/usr/bin/env node
import { Command } from 'commander';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_PATH, saveConfig, AppConfig } from '../config';

const program = new Command();

program
  .name('fc-connect')
  .description('Feishu Claude Connect - 飞书多 Agent 编排桥接服务')
  .version('0.1.0');

// ── init 命令 ──────────────────────────────────────────
program
  .command('init')
  .description('初始化配置（交互式引导）')
  .option('-c, --config <path>', '配置文件路径', DEFAULT_CONFIG_PATH)
  .action(async (opts) => {
    console.log('\n欢迎使用 FC-CONNECT 初始化向导\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (question: string): Promise<string> =>
      new Promise(resolve => rl.question(question, resolve));

    try {
      const appId = await ask('飞书 App ID (cli_xxx): ');
      const appSecret = await ask('飞书 App Secret: ');
      const claudeBin = await ask('claude 可执行文件路径 (留空自动查找): ');
      const workDir = await ask(`Claude 工作目录 (留空使用主目录): `);

      const config: AppConfig = {
        feishu: {
          app_id: appId.trim(),
          app_secret: appSecret.trim(),
        },
        claude: {
          bin: claudeBin.trim(),
          work_dir: workDir.trim() || '~',
        },
        server: {
          data_dir: '~/.fc-connect',
          log_level: 'info',
        },
        orchestration: {
          script: '',
        },
      };

      // 确保目录存在
      if (!fs.existsSync(DEFAULT_CONFIG_DIR)) {
        fs.mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
      }

      saveConfig(config, opts.config);
      console.log(`\n配置已保存至: ${opts.config}`);
      console.log('运行 fc-connect start 启动服务\n');
    } finally {
      rl.close();
    }
  });

// ── start 命令 ─────────────────────────────────────────
program
  .command('start')
  .description('启动 FC-CONNECT 桥接服务')
  .option('-c, --config <path>', '配置文件路径', DEFAULT_CONFIG_PATH)
  .action(async (opts) => {
    // 延迟引入避免配置未加载时出错
    const { loadConfig } = await import('../config');
    const { setLogLevel } = await import('../logger');
    const { logger } = await import('../logger');
    const { FeishuClient } = await import('../feishu/client');
    const { SessionManager } = await import('../claude/session');
    const { MessageRouter } = await import('../router/handler');

    let config;
    try {
      config = loadConfig(opts.config);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }

    setLogLevel(config.server.log_level);

    console.log(`
╔══════════════════════════════════╗
║       FC-CONNECT v0.1.0          ║
║  Feishu Claude Connect           ║
╚══════════════════════════════════╝
`);

    logger.info('加载配置成功');
    logger.info(`App ID: ${config.feishu.app_id}`);
    logger.info(`数据目录: ${config.server.data_dir}`);

    const feishu = new FeishuClient(config.feishu);
    const sessions = new SessionManager(config.claude, config.server.data_dir);

    // 编排配置：orchestrate.js 路径从 config.toml [orchestration].script 读取
    // agents.json 和 orchestrator_prompt.md 固定在 data_dir 下
    const orchestrateScript = config.orchestration.script;
    const agentsFile = path.join(config.server.data_dir, 'agents.json');
    const promptFile = path.join(config.server.data_dir, 'orchestrator_prompt.md');

    if (orchestrateScript) {
      logger.info(`编排模式：已启用（脚本: ${orchestrateScript}）`);
    }

    const router = new MessageRouter(feishu, sessions, {
      orchestrateScript,
      agentsFile,
      promptFile,
      claudeBin: config.claude.bin || 'ept claude',
    });

    await router.init();
    router.start();

    // 优雅退出
    process.on('SIGINT', () => {
      logger.info('收到退出信号，正在关闭...');
      process.exit(0);
    });
  });

program.parse(process.argv);
