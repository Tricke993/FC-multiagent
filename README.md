# FC-CONNECT

飞书 × Claude Code 桥接服务。让飞书 Bot 与 Claude Code 对话，支持多 Agent 自主编排。

---

## 它解决了什么问题

市面上现有的飞书 × Claude 桥接方案（如 cc-connect）返回的是飞书**流式输出卡片**格式，这种格式无法被飞书消息列表 API 读取，导致无法实现多 Agent 自动接力（Orchestrator 读不到 Bot 的回复）。

FC-CONNECT 的核心特点：

- 回复格式为**普通文本消息**，飞书 API 可直接读取
- 支持 **Claude Code 会话持久化**（同一话题内保持上下文）
- 支持**多 Agent 编排**：由 Orchestrator 自主决定调用哪些 Agent、何时结束

---

## 前置要求

- **Node.js** 18+
- **Claude Code**（`claude` 命令可用，或自定义封装命令如 `ept claude`）
- **lark-cli**（多 Agent 编排功能需要）：`npm install -g @larksuite/cli`
- **飞书应用**：在[飞书开放平台](https://open.feishu.cn)创建，需开通以下权限：
  - `im:message`（接收和发送消息）
  - `im:message.receive_v1`（WebSocket 事件订阅）

---

## 安装

### 方式一：从 GitHub 克隆（推荐开发者使用）

```bash
git clone https://github.com/your-username/fc-connect.git
cd fc-connect
npm install
npm run build
```

### 方式二：npm 全局安装（发布后可用）

```bash
npm install -g @your-scope/fc-connect
```

---

## 快速开始

### 第一步：初始化配置

```bash
fc-connect init
```

按提示输入飞书 App ID、App Secret 和 Claude 命令路径，配置文件会自动生成到 `~/.fc-connect/config.toml`。

也可以手动复制示例文件：

```bash
cp config.example.toml ~/.fc-connect/config.toml
# 然后用文本编辑器填写你的信息
```

### 第二步：启动服务

```bash
fc-connect start
```

看到以下输出说明启动成功：

```
[INFO] Feishu WebSocket 已连接，开始监听消息...
```

### 第三步：在飞书测试

在飞书中向你的 Bot 发一条消息（私聊或群聊 @Bot），Bot 会调用 Claude Code 并以普通文本回复。

---

## 配置说明

配置文件位于 `~/.fc-connect/config.toml`：

```toml
[feishu]
app_id = "cli_xxxxxxxxxxxxxxxx"   # 飞书 App ID
app_secret = "xxxxxxxxxxxx"       # 飞书 App Secret

[claude]
bin = "claude"                    # Claude 可执行命令（或 "ept claude" 等自定义命令）
work_dir = "~"                    # Claude 默认工作目录

[server]
data_dir = "~/.fc-connect"       # 数据目录（存放会话文件、Agent 配置等）
log_level = "info"                # 日志级别：debug / info / warn / error

[orchestration]
script = ""                       # 多 Agent 编排脚本路径（留空则禁用）
```

修改配置后重启服务生效：

```bash
# 停止服务（Ctrl+C），然后重新启动
fc-connect start
```

---

## 会话机制

- **私聊**：每个用户独立 Claude 会话，跨消息保持上下文
- **话题群**：每个话题（`omt_xxx`）对应独立 Claude 会话，同话题内保持上下文，不同话题互不干扰
- **普通群**：整个群共享一个 Claude 会话

### 内置指令

在飞书对话框输入以下指令：

| 指令 | 功能 |
|------|------|
| `/new` | 清除当前会话，开始全新对话 |
| `/status` | 查看当前会话 ID 和运行时长 |
| `/help` | 显示帮助信息 |

---

## 多 Agent 编排（可选）

让多个 FC-CONNECT 实例协作，由 Orchestrator 自主协调完成复杂任务。

### 工作原理

```
用户 @你的Bot "任务描述"
    ↓
Orchestrator（Claude Code session）启动
    ↓ 分析任务，选择合适的 Agent
    ↓ 以用户身份 @目标Agent，发送子任务
    ↓ 等待 Agent 回复，评估质量
    ↓ 不满意则继续要求修改，满意则继续
    ↓ 所有 Agent 协作完成后，汇总发布结果
```

### 配置步骤

**1. 添加可用 Agent（`~/.fc-connect/agents.json`）**

```json
{
  "agents": [
    {
      "name": "Agent名称",
      "open_id": "ou_xxxxxxxxxxxxxxxxxxxxxx",
      "skills": ["技能1", "技能2"],
      "description": "这个 Agent 擅长做什么"
    }
  ]
}
```

每个 Agent 对应另一台机器上运行的 FC-CONNECT 实例（使用该 Agent 的飞书 Bot 凭证）。

**2. 自定义 Orchestrator 提示词（`~/.fc-connect/orchestrator_prompt.md`）**

这是 Orchestrator 的"工作指南"，可以根据你的业务场景自由调整：
- 质量评估标准
- 任务分配策略
- 输出格式要求
- 超时处理方式

文件中的模板变量会被自动替换：

| 变量 | 说明 |
|------|------|
| `{{AGENTS_LIST}}` | 可用 Agent 列表（从 agents.json 生成） |
| `{{THREAD_ID}}` | 飞书话题 ID |
| `{{CHAT_ID}}` | 飞书群 ID |
| `{{ROOT_ID}}` | 话题根消息 ID |
| `{{USER_MESSAGE}}` | 用户原始消息 |

**3. 配置编排脚本路径（`config.toml`）**

```toml
[orchestration]
script = "/path/to/orchestrate.js"
```

`orchestrate.js` 是多 Agent 编排的入口脚本，[示例脚本](./multiagent/orchestrate.js)见 multiagent 目录。

**4. 确保 lark-cli 有用户身份授权**

Orchestrator 需要以**用户身份**向其他 Bot 发消息（飞书不允许 Bot 向 Bot 发消息）：

```bash
lark-cli auth login --as user
```

---

## 常见问题

**Q：Bot 没有回复消息**

检查：
1. 飞书应用是否开启了 `im:message` 和 WebSocket 相关权限
2. 群聊中需要 @Bot 才会响应（私聊则直接响应）
3. 查看日志：启动时加 `log_level = "debug"` 看详细输出

**Q：多 Agent 编排没有触发**

检查：
1. `config.toml` 中 `[orchestration].script` 是否填写了正确路径
2. `~/.fc-connect/agents.json` 是否存在且有 Agent 信息
3. 消息是否在话题（thread）中发送（普通群消息不触发编排）

**Q：会话丢失（重启后忘记之前的对话）**

会话文件存储在 `~/.fc-connect/sessions.json`，重启后自动恢复。如果丢失，发 `/new` 开始新会话即可。

---

## 数据目录结构

服务运行后，`~/.fc-connect/` 目录下会有以下文件：

```
~/.fc-connect/
├── config.toml              # 主配置文件
├── sessions.json            # Claude 会话持久化数据
├── agents.json              # Agent 注册表（多 Agent 编排用）
└── orchestrator_prompt.md   # Orchestrator 提示词模板
```

---

## License

MIT
