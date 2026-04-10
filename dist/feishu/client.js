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
exports.FeishuClient = void 0;
const lark = __importStar(require("@larksuiteoapi/node-sdk"));
const logger_1 = require("../logger");
class FeishuClient {
    constructor(config) {
        this.botOpenId = '';
        this.handlers = [];
        this.client = new lark.Client({
            appId: config.app_id,
            appSecret: config.app_secret,
            disableTokenCache: false,
        });
        this.wsClient = new lark.WSClient({
            appId: config.app_id,
            appSecret: config.app_secret,
            loggerLevel: lark.LoggerLevel.warn,
        });
    }
    // 获取 Bot 自身 open_id
    async getBotInfo() {
        const res = await this.client.request({
            method: 'GET',
            url: '/open-apis/bot/v3/info',
        });
        const bot = res?.bot;
        this.botOpenId = bot?.open_id || '';
        return {
            openId: this.botOpenId,
            name: bot?.app_name || '',
        };
    }
    // 注册消息处理器
    onMessage(handler) {
        this.handlers.push(handler);
    }
    // 启动 WebSocket 监听
    start() {
        this.wsClient.start({
            eventDispatcher: new lark.EventDispatcher({}).register({
                'im.message.receive_v1': async (data) => {
                    const msg = this.parseMessage(data);
                    if (!msg)
                        return;
                    // 过滤自己发的消息
                    if (msg.senderId === this.botOpenId)
                        return;
                    logger_1.logger.debug('收到消息:', msg.content.slice(0, 50));
                    for (const handler of this.handlers) {
                        try {
                            handler(msg);
                        }
                        catch (err) {
                            logger_1.logger.error('消息处理器异常:', err);
                        }
                    }
                },
            }),
        });
        logger_1.logger.info('Feishu WebSocket 已连接，开始监听消息...');
    }
    // 发送普通文本消息
    async sendText(chatId, text) {
        try {
            await this.client.im.message.create({
                params: { receive_id_type: 'chat_id' },
                data: {
                    receive_id: chatId,
                    msg_type: 'text',
                    content: JSON.stringify({ text }),
                },
            });
        }
        catch (err) {
            logger_1.logger.error('发送消息失败:', err);
            throw err;
        }
    }
    // 添加表情回复，返回 reaction_id（用于后续删除）
    async addReaction(messageId, emojiType = 'OneSecond') {
        try {
            const res = await this.client.im.messageReaction.create({
                path: { message_id: messageId },
                data: { reaction_type: { emoji_type: emojiType } },
            });
            // SDK 可能返回完整响应 {code, data} 或直接返回 data
            const reactionId = res?.reaction_id || res?.data?.reaction_id || '';
            logger_1.logger.info(`表情已添加 [${emojiType}], reaction_id: ${reactionId.slice(0, 20)}...`);
            return reactionId;
        }
        catch (err) {
            logger_1.logger.warn('添加表情失败:', err);
            return '';
        }
    }
    // 删除表情回复
    async deleteReaction(messageId, reactionId) {
        if (!reactionId)
            return;
        try {
            await this.client.im.messageReaction.delete({
                path: { message_id: messageId, reaction_id: reactionId },
            });
        }
        catch (err) {
            logger_1.logger.warn('删除表情失败:', err);
        }
    }
    // 回复指定消息（带引用）
    async replyText(messageId, text) {
        try {
            await this.client.im.message.reply({
                path: { message_id: messageId },
                data: {
                    msg_type: 'text',
                    content: JSON.stringify({ text }),
                },
            });
        }
        catch (err) {
            logger_1.logger.error('回复消息失败:', err);
            throw err;
        }
    }
    // 解析飞书消息事件为统一结构
    parseMessage(data) {
        try {
            const message = data?.message;
            const sender = data?.sender;
            if (!message || !sender)
                return null;
            // 解析消息内容
            let content = '';
            const msgType = message.message_type;
            if (msgType === 'text') {
                const body = JSON.parse(message.content || '{}');
                content = body.text || '';
            }
            else {
                // 暂不处理非文本消息
                return null;
            }
            // 解析 @mentions
            const mentions = (message.mentions || []).map((m) => ({
                key: m.key || '',
                id: m.id?.open_id || '',
                name: m.name || '',
                isBot: m.id?.id_type === 'app_id' || false,
            }));
            // 清理消息文本中的 @mention 占位符（@_user_1 等格式）
            let cleanContent = content;
            for (const mention of mentions) {
                cleanContent = cleanContent.replace(mention.key, '').trim();
            }
            return {
                messageId: message.message_id || '',
                chatId: message.chat_id || '',
                threadId: message.thread_id || '',
                rootId: message.root_id || '',
                chatType: message.chat_type === 'p2p' ? 'p2p' : 'group',
                senderId: sender.sender_id?.open_id || '',
                senderType: sender.sender_type === 'user' ? 'user' : 'bot',
                content: cleanContent,
                mentions,
                createTime: message.create_time || '',
            };
        }
        catch (err) {
            logger_1.logger.error('解析消息失败:', err);
            return null;
        }
    }
}
exports.FeishuClient = FeishuClient;
//# sourceMappingURL=client.js.map