import { FeishuConfig } from '../config';
export interface IncomingMessage {
    messageId: string;
    chatId: string;
    threadId: string;
    rootId: string;
    chatType: 'p2p' | 'group';
    senderId: string;
    senderType: 'user' | 'bot';
    content: string;
    mentions: Mention[];
    createTime: string;
}
export interface Mention {
    key: string;
    id: string;
    name: string;
    isBot: boolean;
}
type MessageHandler = (msg: IncomingMessage) => void;
export declare class FeishuClient {
    private client;
    private wsClient;
    private botOpenId;
    private handlers;
    constructor(config: FeishuConfig);
    getBotInfo(): Promise<{
        openId: string;
        name: string;
    }>;
    onMessage(handler: MessageHandler): void;
    start(): void;
    sendText(chatId: string, text: string): Promise<void>;
    addReaction(messageId: string, emojiType?: string): Promise<string>;
    deleteReaction(messageId: string, reactionId: string): Promise<void>;
    replyText(messageId: string, text: string): Promise<void>;
    private parseMessage;
}
export {};
//# sourceMappingURL=client.d.ts.map