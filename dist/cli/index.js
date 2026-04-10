#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const readline = __importStar(require("readline"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("../config");
const program = new commander_1.Command();
program
    .name('fc-connect')
    .description('Feishu Claude Connect - 飞书多 Agent 编排桥接服务')
    .version('0.1.0');
// ── init 命令 ──────────────────────────────────────────
program
    .command('init')
    .description('初始化配置（交互式引导）')
    .option('-c, --config <path>', '配置文件路径', config_1.DEFAULT_CONFIG_PATH)
    .action(async (opts) => {
    console.log('\n欢迎使用 FC-CONNECT 初始化向导\n');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const ask = (question) => new Promise(resolve => rl.question(question, resolve));
    try {
        const appId = await ask('飞书 App ID (cli_xxx): ');
        const appSecret = await ask('飞书 App Secret: ');
        const claudeBin = await ask('claude 可执行文件路径 (留空自动查找): ');
        const workDir = await ask(`Claude 工作目录 (留空使用主目录): `);
        const config = {
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
        if (!fs.existsSync(config_1.DEFAULT_CONFIG_DIR)) {
            fs.mkdirSync(config_1.DEFAULT_CONFIG_DIR, { recursive: true });
        }
        (0, config_1.saveConfig)(config, opts.config);
        console.log(`\n配置已保存至: ${opts.config}`);
        console.log('运行 fc-connect start 启动服务\n');
    }
    finally {
        rl.close();
    }
});
// ── start 命令 ─────────────────────────────────────────
program
    .command('start')
    .description('启动 FC-CONNECT 桥接服务')
    .option('-c, --config <path>', '配置文件路径', config_1.DEFAULT_CONFIG_PATH)
    .action(async (opts) => {
    // 延迟引入避免配置未加载时出错
    const { loadConfig } = await Promise.resolve().then(() => __importStar(require('../config')));
    const { setLogLevel } = await Promise.resolve().then(() => __importStar(require('../logger')));
    const { logger } = await Promise.resolve().then(() => __importStar(require('../logger')));
    const { FeishuClient } = await Promise.resolve().then(() => __importStar(require('../feishu/client')));
    const { SessionManager } = await Promise.resolve().then(() => __importStar(require('../claude/session')));
    const { MessageRouter } = await Promise.resolve().then(() => __importStar(require('../router/handler')));
    let config;
    try {
        config = loadConfig(opts.config);
    }
    catch (err) {
        console.error(err.message);
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
//# sourceMappingURL=index.js.map