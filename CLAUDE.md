# FC-CONNECT 项目说明

## 是什么

飞书 × Claude Code 桥接服务。接收飞书消息 → 调用 Claude Code → 以**普通文本**回复。

与 cc-connect 的核心区别：cc-connect 回复飞书流式输出卡片格式，无法被 `im_v1_message_list` API 读取；FC-CONNECT 回复普通文本，API 可直接读取，支持多 Agent 编排。

---

## 目录结构

```
fc-connect/
├── src/
│   ├── config.ts          # 配置加载（TOML 解析，~ 路径展开，含 OrchestrationConfig）
│   ├── logger.ts          # 彩色日志，支持 debug/info/warn/error
│   ├── index.ts           # 包导出入口
│   ├── feishu/
│   │   └── client.ts      # 飞书 WebSocket 客户端（收消息/发消息/表情）
│   ├── claude/
│   │   └── session.ts     # Claude Code 子进程管理 + 会话持久化
│   ├── router/
│   │   └── handler.ts     # 消息路由（内置指令 + Orchestrator 触发 + Claude 直接处理降级）
│   └── cli/
│       └── index.ts       # CLI 入口（fc-connect init / fc-connect start）
├── config.example.toml    # 配置模板
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

**用户数据目录**（`~/.fc-connect/`，不在仓库里）：
```
~/.fc-connect/
├── config.toml              # 主配置文件
├── sessions.json            # Claude 会话持久化数据
├── agents.json              # Agent 注册表（多 Agent 编排用，可选）
└── orchestrator_prompt.md   # Orchestrator 提示词模板（可选）
```

---

## 各文件职责

| 文件 | 职责 |
|------|------|
| `src/config.ts` | 读取 `~/.fc-connect/config.toml`，校验必填字段，展开 `~` 路径，含 `OrchestrationConfig` |
| `src/logger.ts` | 按日志级别输出带时间戳的彩色日志 |
| `src/feishu/client.ts` | 使用 `@larksuiteoapi/node-sdk` 建立 WebSocket 长连接，解析消息，发送回复，管理表情 reaction |
| `src/claude/session.ts` | spawn Claude Code 子进程，管理每个 `threadId/chatId` 的 Claude 会话，持久化到 `sessions.json` |
| `src/router/handler.ts` | 判断是否响应消息，处理内置指令，满足条件时触发 Orchestrator，否则直接 Claude 处理 |
| `src/cli/index.ts` | `fc-connect init`（向导式初始化配置）、`fc-connect start`（启动服务） |

---

## 关键技术点

### 1. ept claude（非标准 claude 命令）

本机使用封装版 Claude Code，命令为 `ept claude`（解决了认证问题）。

```bash
# 新会话
ept claude --print --output-format json "你的消息"

# 续接会话
ept claude --resume <session_id> --print --output-format json "你的消息"
```

**输出格式**：NDJSON，最终回复在 `type=result, subtype=success` 的行里：
```json
{"type":"result","subtype":"success","session_id":"xxx","result":"回复内容"}
```

### 2. spawn 处理两词命令

`spawn()` 不能直接处理带空格的命令字符串，需要拆分：

```typescript
const binParts = this.claudeBin.trim().split(/\s+/);
const executable = binParts[0];       // "ept"
const prefixArgs = binParts.slice(1); // ["claude"]
const fullArgs = [...prefixArgs, ...args];
const child = spawn(executable, fullArgs, { cwd, ... });
```

### 3. 会话持久化与话题隔离

- **session key = `threadId || chatId`**：话题消息用 `threadId`（`omt_xxx`），私聊/普通群用 `chatId`
- 每个话题对应独立 Claude 会话，不同话题间完全隔离
- 会话信息保存在 `~/.fc-connect/sessions.json`，进程重启后自动恢复
- 用户可发 `/new` 强制开始新会话

### 4. Reaction 交互流程

```
收到消息
  → addReaction(messageId, 'OneSecond')     ← 立即显示[稍等]
  → 处理（Claude 直接 或 spawn Orchestrator）
  → replyText(messageId, response)          ← 回复文本
  → deleteReaction(messageId, reactionId)   ← 删除[稍等]（finally 块，确保执行）
```

`reaction_id` 提取兼容两种 SDK 响应结构：
```typescript
const reactionId = res?.reaction_id || res?.data?.reaction_id || '';
```

多 Agent 编排时，`deleteReaction` 由 `orchestrate.js` 子进程负责（完成编排后删除）。

### 5. 多 Agent 编排触发

handler.ts 收到消息后，满足以下全部条件则 spawn `orchestrate.js`（detached），否则降级直接 Claude 处理：

```
条件 1：config.toml [orchestration].script 非空
条件 2：消息包含 threadId（话题群消息）
条件 3：~/.fc-connect/agents.json 存在且 agents 数组非空
```

编排架构详见 `D:\yangxiufeng\Desktop\claudecode\multiagent\CLAUDE.md`。

---

## 配置说明

路径：`~/.fc-connect/config.toml`

```toml
[feishu]
app_id = "cli_xxx"      # 飞书应用 App ID
app_secret = "xxx"      # 飞书应用 App Secret

[claude]
bin = "ept claude"      # Claude Code 可执行命令（支持带空格）
work_dir = "~"          # Claude 默认工作目录

[server]
data_dir = "~/.fc-connect"  # 会话数据存储目录
log_level = "info"           # 日志级别: debug/info/warn/error

[orchestration]
script = ""             # orchestrate.js 路径（留空则禁用多 Agent 编排）
```

---

## 构建与启动

```bash
cd D:\yangxiufeng\Desktop\claudecode\fc-connect

npm install        # 安装依赖
npm run build      # 编译 TypeScript

node dist/cli/index.js start   # 启动服务
node dist/cli/index.js init    # 首次配置（交互式向导）
```

---

## 响应逻辑

- **私聊（p2p）**：所有消息都响应
- **群聊（group）**：只响应 @了本 Bot 的消息
- **防重复**：`processing: Set<string>` 防止同一条消息被重复处理

## 内置指令

| 指令 | 功能 |
|------|------|
| `/new` | 清除当前会话，开始新对话 |
| `/status` | 显示当前会话 ID 和已运行时长 |
| `/help` | 显示帮助信息 |

---

## 已知坑 / 已修复问题

| 问题 | 原因 | 修复方式 |
|------|------|---------|
| `Property 'bot' does not exist on type 'Client'` | SDK 类型定义不完整 | 改用 `(this.client as any).request({ method: 'GET', url: '/open-apis/bot/v3/info' })` |
| spawn 报错无法启动进程 | `spawn` 不支持带空格命令字符串 | 按空格拆分，`binParts[0]` 为 executable，剩余为 prefixArgs |
| `reaction_id` 为空导致表情无法删除 | SDK 响应结构不确定 | 用 `\|\|` 兼容 `res.reaction_id` 和 `res.data.reaction_id` 两种结构 |
| 表情显示为[思考]而非[稍等] | emoji type 写成了 `THINKING` | 改为 `OneSecond` |
| 群聊机器人回复自己触发循环 | 未过滤发送者 | 在 `parseMessage` 中过滤 `senderId === botOpenId` |
| 同群不同话题共享同一 Claude session | session key 用 `chatId`，全群共用 | 改为 `threadId \|\| chatId`，每个话题独立 session |
| TypeScript 编译错误：`AppConfig` 缺少 `orchestration` 字段 | `init` 命令创建的对象未含新字段 | 在 `cli/index.ts` 的 init 命令里补充 `orchestration: { script: '' }` |
