import { ClaudeConfig } from '../config';
export interface Session {
    chatId: string;
    claudeSessionId: string;
    workDir: string;
    createdAt: number;
    lastActiveAt: number;
}
export declare class SessionManager {
    private sessions;
    private dataDir;
    private claudeBin;
    private defaultWorkDir;
    private sessionsFile;
    constructor(config: ClaudeConfig, dataDir: string);
    sendMessage(chatId: string, message: string): Promise<string>;
    deleteSession(chatId: string): boolean;
    getSession(chatId: string): Session | undefined;
    private runClaude;
    private parseOutput;
    private loadSessions;
    private saveSessions;
}
//# sourceMappingURL=session.d.ts.map