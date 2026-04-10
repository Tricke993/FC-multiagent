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
    script: string;
}
export interface AppConfig {
    feishu: FeishuConfig;
    claude: ClaudeConfig;
    server: ServerConfig;
    orchestration: OrchestrationConfig;
}
export declare const DEFAULT_CONFIG_DIR: string;
export declare const DEFAULT_CONFIG_PATH: string;
export declare function loadConfig(configPath?: string): AppConfig;
export declare function saveConfig(config: AppConfig, configPath?: string): void;
//# sourceMappingURL=config.d.ts.map