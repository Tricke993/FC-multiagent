import * as lark from '@larksuiteoapi/node-sdk';
import { FeishuConfig } from '../config';
import { logger } from '../logger';

// 接收到的消息结构
export interface IncomingMessage {
  messageId: string;
  chatId: string;
  threadId: string;        // 话题 ID（话题群消息才有，格式 omt_xxx）
  rootId: string;          // 话题根消息 ID
  chatType: 'p2p' | 'group';
  senderId: string;        // 发送者 open_id
  senderType: 'user' | 'bot';
  content: string;         // 纯文本内容
  mentions: Mention[];     // @提及列表
  createTime: string;
}

export interface Mention {
  key: string;      // @key，如 @_user_1
  id: string;       // open_id
  name: string;     // 显示名
  isBot: boolean;
}

type MessageHandler = (msg: IncomingMessage) => void;

export class FeishuClient {
  private client: lark.Client;
  private wsClient: lark.WSClient;
  private botOpenId: string = '';
  private handlers: MessageHandler[] = [];

  constructor(config: FeishuConfig) {
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
  async getBotInfo(): Promise<{ openId: string; name: string }> {
    const res = await (this.client as any).request({
      method: 'GET',
      url: '/open-apis/bot/v3/info',
    }) as any;
    const bot = res?.bot;
    this.botOpenId = bot?.open_id || '';
    return {
      openId: this.botOpenId,
      name: bot?.app_name || '',
    };
  }

  // 注册消息处理器
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  // 启动 WebSocket 监听
  start(): void {
    this.wsClient.start({
      eventDispatcher: new lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data: any) => {
          const msg = this.parseMessage(data);
          if (!msg) return;

          // 过滤自己发的消息
          if (msg.senderId === this.botOpenId) return;

          logger.debug('收到消息:', msg.content.slice(0, 50));

          for (const handler of this.handlers) {
            try {
              handler(msg);
            } catch (err) {
              logger.error('消息处理器异常:', err);
            }
          }
        },
      }),
    });

    logger.info('Feishu WebSocket 已连接，开始监听消息...');
  }

  // 发送普通文本消息
  async sendText(chatId: string, text: string): Promise<void> {
    try {
      await this.client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      });
    } catch (err) {
      logger.error('发送消息失败:', err);
      throw err;
    }
  }

  // 添加表情回复，返回 reaction_id（用于后续删除）
  async addReaction(messageId: string, emojiType: string = 'OneSecond'): Promise<string> {
    try {
      const res = await this.client.im.messageReaction.create({
        path: { message_id: messageId },
        data: { reaction_type: { emoji_type: emojiType } },
      }) as any;
      // SDK 可能返回完整响应 {code, data} 或直接返回 data
      const reactionId = res?.reaction_id || res?.data?.reaction_id || '';
      logger.info(`表情已添加 [${emojiType}], reaction_id: ${reactionId.slice(0, 20)}...`);
      return reactionId;
    } catch (err) {
      logger.warn('添加表情失败:', err);
      return '';
    }
  }

  // 删除表情回复
  async deleteReaction(messageId: string, reactionId: string): Promise<void> {
    if (!reactionId) return;
    try {
      await this.client.im.messageReaction.delete({
        path: { message_id: messageId, reaction_id: reactionId },
      });
    } catch (err) {
      logger.warn('删除表情失败:', err);
    }
  }

  // 回复指定消息（带引用）
  async replyText(messageId: string, text: string): Promise<void> {
    try {
      await this.client.im.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      });
    } catch (err) {
      logger.error('回复消息失败:', err);
      throw err;
    }
  }

  // 解析飞书消息事件为统一结构
  private parseMessage(data: any): IncomingMessage | null {
    try {
      const message = data?.message;
      const sender = data?.sender;
      if (!message || !sender) return null;

      // 解析消息内容
      let content = '';
      const msgType = message.message_type;
      if (msgType === 'text') {
        const body = JSON.parse(message.content || '{}');
        content = body.text || '';
      } else {
        // 暂不处理非文本消息
        return null;
      }

      // 解析 @mentions
      const mentions: Mention[] = (message.mentions || []).map((m: any) => ({
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
    } catch (err) {
      logger.error('解析消息失败:', err);
      return null;
    }
  }
}
