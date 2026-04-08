import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as toml from 'toml';

export interface FeishuConfig {
  app_id: string;
  app_secret: string;
}

export interface ClaudeConfig {
  bin: string;
  work_dir: string;
}

export interface ServerConfig {
  data_dir: string;
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

export interface OrchestrationConfig {
  // orchestrate.js 脚本路径，为空则禁用编排功能
  script: string;
}

export interface AppConfig {
  feishu: FeishuConfig;
  claude: ClaudeConfig;
  server: ServerConfig;
  orchestration: OrchestrationConfig;
}

// 将 ~ 展开为真实主目录
function expandHome(p: string): string {
  if (!p) return p;
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

// 默认配置目录
export const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.fc-connect');
export const DEFAULT_CONFIG_PATH = path.join(DEFAULT_CONFIG_DIR, 'config.toml');

export function loadConfig(configPath?: string): AppConfig {
  const filePath = expandHome(configPath || DEFAULT_CONFIG_PATH);

  if (!fs.existsSync(filePath)) {
    throw new Error(`配置文件不存在: ${filePath}\n请先运行 fc-connect init 进行初始化`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = toml.parse(raw) as Partial<AppConfig>;

  // 合并默认值
  const config: AppConfig = {
    feishu: {
      app_id: parsed.feishu?.app_id || '',
      app_secret: parsed.feishu?.app_secret || '',
    },
    claude: {
      bin: parsed.claude?.bin || '',
      work_dir: expandHome(parsed.claude?.work_dir || '~'),
    },
    server: {
      data_dir: expandHome(parsed.server?.data_dir || '~/.fc-connect'),
      log_level: parsed.server?.log_level || 'info',
    },
    orchestration: {
      script: expandHome((parsed as any).orchestration?.script || ''),
    },
  };

  // 校验必填项
  if (!config.feishu.app_id || !config.feishu.app_secret) {
    throw new Error('配置错误：feishu.app_id 和 feishu.app_secret 不能为空');
  }

  return config;
}

export function saveConfig(config: AppConfig, configPath?: string): void {
  const filePath = expandHome(configPath || DEFAULT_CONFIG_PATH);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = `[feishu]
app_id = "${config.feishu.app_id}"
app_secret = "${config.feishu.app_secret}"

[claude]
bin = "${config.claude.bin}"
work_dir = "${config.claude.work_dir}"

[server]
data_dir = "${config.server.data_dir}"
log_level = "${config.server.log_level}"
`;

  fs.writeFileSync(filePath, content, 'utf-8');
}
