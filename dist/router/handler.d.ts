import { FeishuClient } from '../feishu/client';
import { SessionManager } from '../claude/session';
export declare class MessageRouter {
    private feishu;
    private sessions;
    private botOpenId;
    private processing;
    private orchestrateScript;
    private agentsFile;
    private promptFile;
    private claudeBin;
    constructor(feishu: FeishuClient, sessions: SessionManager, orchestration?: {
        orchestrateScript: string;
        agentsFile: string;
        promptFile: string;
        claudeBin: string;
    });
    init(): Promise<void>;
    start(): void;
    private handleMessage;
    private hasAgents;
    private spawnOrchestrator;
    private handleWithClaude;
    private shouldRespond;
    private handleCommand;
}
//# sourceMappingURL=handler.d.ts.map