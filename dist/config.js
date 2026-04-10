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
exports.DEFAULT_CONFIG_PATH = exports.DEFAULT_CONFIG_DIR = void 0;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const toml = __importStar(require("toml"));
// 将 ~ 展开为真实主目录
function expandHome(p) {
    if (!p)
        return p;
    if (p.startsWith('~/') || p === '~') {
        return path.join(os.homedir(), p.slice(1));
    }
    return p;
}
// 默认配置目录
exports.DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.fc-connect');
exports.DEFAULT_CONFIG_PATH = path.join(exports.DEFAULT_CONFIG_DIR, 'config.toml');
function loadConfig(configPath) {
    const filePath = expandHome(configPath || exports.DEFAULT_CONFIG_PATH);
    if (!fs.existsSync(filePath)) {
        throw new Error(`配置文件不存在: ${filePath}\n请先运行 fc-connect init 进行初始化`);
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = toml.parse(raw);
    // 合并默认值
    const config = {
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
            script: expandHome(parsed.orchestration?.script || ''),
        },
    };
    // 校验必填项
    if (!config.feishu.app_id || !config.feishu.app_secret) {
        throw new Error('配置错误：feishu.app_id 和 feishu.app_secret 不能为空');
    }
    return config;
}
function saveConfig(config, configPath) {
    const filePath = expandHome(configPath || exports.DEFAULT_CONFIG_PATH);
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
//# sourceMappingURL=config.js.map