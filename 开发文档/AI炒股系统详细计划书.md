# AI 炒股 Agent 系统详细计划书

> **版本**：v0.1 | **日期**：2026-07-04 | **更新**：2026-07-04（标注实现状态）  
> **定位**：个人投资记录 + AI 投研助手 + 定时 Agent 监控系统  
> **当前形态**：✅ Tauri + React Windows 桌面 GUI 应用  
> **重要说明**：本系统为辅助分析与记录工具，不承诺收益，不自动交易，所有买卖决策必须由用户确认。

---

# 八耻八荣（行为准则）
1、AI协作与开发版：
以认真查阅为荣，以暗猜接口为耻；
以寻求确认为荣，以模糊执行为耻；
以人类确认为荣，以盲想业务为耻；
以复用现有为荣，以创造接口为耻；
以主动测试为荣，以跳过验证为耻；
以遵循规范为荣，以破坏架构为耻；
以诚实无知为荣，以假装理解为耻；
以谨慎重构为荣，以盲目修改为耻。


## 1. 项目愿景

用户打开应用后，可以选择自己想使用的 AI 厂商和模型，把当前持仓、本金、交易记录告诉 AI。AI 自动理解用户输入，结构化写入系统，并持续作为一个有记忆、有提示词、有定时任务的投资助手。

系统会以卡片形式展示：

- 总资产
- 本金
- 现金
- 总收益
- 收益率
- 持仓快照
- 每只股票的独立卡片
- AI 最近观点
- 定时 Agent 执行记录

重点不是做一个普通记账软件，而是做一个“会主动醒来、会看行情、会结合用户持仓记忆、会在聊天框里给出观点”的股票 Agent 系统。

---

## 2. 核心用户流程

### 2.1 首次打开应用

1. 用户进入应用首页。
2. 系统展示 AI 助手选择区域。
3. 用户选择 AI 厂商：
   - OpenAI
   - Anthropic Claude
   - Google Gemini
   - DeepSeek
   - 通义千问
   - 智谱 GLM
   - Moonshot Kimi
   - 本地模型，如 Ollama、LM Studio
4. 用户选择具体模型。
5. 用户填写或导入 API Key。
6. 系统测试模型连通性。
7. 用户进入主工作台。

### 2.2 用户录入持仓

用户可以直接在聊天框输入自然语言，例如：

```text
我现在本金 10 万，买了 300 股贵州茅台，成本 1680；还买了 1000 股宁德时代，成本 180，现金还剩 2 万。
```

AI 需要自动识别为结构化信息：

- 本金：100000
- 现金：20000
- 持仓 1：
  - 股票名称：贵州茅台
  - 股票代码：待系统匹配
  - 数量：300
  - 成本价：1680
- 持仓 2：
  - 股票名称：宁德时代
  - 股票代码：待系统匹配
  - 数量：1000
  - 成本价：180

识别后，系统先给用户确认：

```text
我识别到你的账户信息如下：
本金 100000 元，现金 20000 元。
持仓：贵州茅台 300 股，成本 1680；宁德时代 1000 股，成本 180。
是否写入账户？
```

用户确认后，写入数据库。

### 2.3 主界面展示

主界面参考用户提供的截图，采用信息卡片布局：

- 顶部：当前 AI 助手名称，例如 `Gemini 3.1 Pro DeepThink`
- 顶部状态点：模型在线、行情 API 在线、Agent 定时任务状态
- 总览卡片：
  - 总资产
  - 本金
  - 总收益
  - 收益率
  - 现金
  - 持仓数量
  - 今日提醒数量
  - AI 观点数量
- 持仓区域：
  - 每只股票一个卡片
  - 股票名称
  - 股票代码
  - 当前价
  - 持仓数量
  - 成本价
  - 市值
  - 浮动盈亏
  - 浮动收益率
  - AI 标签：观察、谨慎、强势、风险、等待确认
- 右侧或底部：AI 聊天框
- Agent 时间轴：
  - 最近一次执行时间
  - 下次执行时间
  - 执行结果摘要

### 2.4 设置 Agent 激活时间

用户可以通过自然语言设置：

```text
每隔 1 小时帮我看一次持仓。
```

或：

```text
每天上午 9:35、10:30、13:30、14:50 分析一次。
```

或：

```text
如果贵州茅台跌破 1600，马上提醒我。
```

系统需要支持三类 Agent 触发方式：

1. 固定间隔触发
   - 每 15 分钟
   - 每 30 分钟
   - 每 1 小时
   - 每 4 小时
2. 固定时间触发
   - 每个交易日 9:35
   - 每个交易日 14:50
   - 每天收盘后
3. 条件触发
   - 股价突破某价格
   - 股价跌破某价格
   - 单日涨跌幅超过某比例
   - 持仓收益率超过某比例
   - 新闻情绪明显变化

---

## 3. 功能模块拆分

## 3.1 AI 模型管理模块

### 目标

让用户可以选择不同 AI 厂商和模型，并管理 API Key。

### 功能

- 厂商列表管理
- 模型列表管理
- API Key 加密存储
- 模型连通性测试
- 默认模型设置
- 备用模型设置
- 模型调用日志
- Token 消耗统计

### 推荐支持模型

| 厂商 | 模型用途 | 备注 |
| --- | --- | --- |
| OpenAI | 综合推理、工具调用、结构化抽取 | 适合作为主 Agent |
| Claude | 长文本分析、稳健总结 | 适合分析研报、公告 |
| Gemini | 多模态、长上下文 | 适合处理图片、表格、网页 |
| DeepSeek | 低成本推理 | 适合频繁定时分析 |
| 通义千问 | 中文场景 | 适合 A 股中文资讯 |
| Kimi | 长文本阅读 | 适合研报和公告摘要 |
| Ollama | 本地隐私 | 适合本地记录和简单分析 |

---

## 3.2 账户与资金模块

### 目标

记录用户本金、现金、资产变化和交易行为。

### 功能

- 本金设置
- 现金余额
- 入金记录
- 出金记录
- 当前总资产
- 累计收益
- 当前收益率
- 历史资产曲线
- 每日账户快照

### 计算公式

```text
持仓市值 = sum(股票当前价 * 持仓数量)
总资产 = 持仓市值 + 现金
总收益 = 总资产 - 本金
收益率 = 总收益 / 本金
个股浮盈 = (当前价 - 成本价) * 持仓数量
个股收益率 = (当前价 - 成本价) / 成本价
```

---

## 3.3 持仓管理模块

### 目标

每只股票形成独立卡片，支持 AI 自动写入、人工编辑和行情更新。

### 功能

- 新增持仓
- 修改持仓
- 删除持仓
- 买入记录
- 卖出记录
- 成本价计算
- 分红送转调整
- 股票代码匹配
- 股票名称模糊搜索
- 持仓标签
- 个股备注

### 股票卡片字段

- 股票名称
- 股票代码
- 市场类型：A 股、港股、美股、ETF、基金
- 持仓数量
- 可用数量
- 成本价
- 当前价
- 持仓市值
- 浮动盈亏
- 浮动收益率
- 今日涨跌幅
- 成交额
- 换手率
- AI 最新判断
- 风险标签
- 用户备注

---

## 3.4 聊天与结构化录入模块

### 目标

用户不用填复杂表单，只要告诉 AI，AI 自动转成系统数据。

### 支持输入

```text
我买了 500 股比亚迪，价格 245。
```

```text
今天卖掉一半宁德时代，成交价 196。
```

```text
我本金从 10 万增加到 15 万。
```

```text
把贵州茅台设置为重点观察。
```

### AI 需要识别的意图

- 设置本金
- 修改现金
- 新增持仓
- 买入股票
- 卖出股票
- 更新成本价
- 添加备注
- 设置关注
- 设置提醒
- 设置 Agent 定时任务
- 查询收益
- 查询个股分析

### 写入策略

AI 不应直接静默修改关键数据。建议流程：

1. AI 解析用户自然语言。
2. 输出结构化草稿。
3. 系统展示确认弹窗或确认消息。
4. 用户确认。
5. 系统写入数据库。
6. AI 回复写入结果。

---

## 3.5 行情数据模块

### 目标

Agent 可以定时调用行情 API 获取股票走势。

### 数据类型

- 实时价格
- 今日涨跌幅
- K 线数据
- 分时数据
- 成交量
- 成交额
- 换手率
- 市盈率
- 市净率
- 板块信息
- 指数信息
- 个股新闻
- 公告
- 财报摘要

### 可选数据源

| 数据源 | 适用市场 | 说明 |
| --- | --- | --- |
| TuShare | A 股 | 数据丰富，部分需要积分 |
| AkShare | A 股、港股、美股 | Python 生态方便，适合原型 |
| 聚宽 JQData | A 股 | 量化友好 |
| 东方财富接口 | A 股 | 可通过非官方方式获取，需注意稳定性 |
| Alpha Vantage | 美股 | 有免费额度 |
| Finnhub | 美股、新闻 | API 规范 |
| Yahoo Finance | 美股、港股 | 免费但稳定性一般 |

### MVP 建议

第一版优先选择：

- A 股：AkShare
- 美股：Yahoo Finance 或 Finnhub
- AI 总结：只对用户持仓调用行情，避免成本过高

---

## 3.6 Agent 定时任务模块

### 目标

用户可以设定 Agent 自动激活时间，Agent 到点后自动获取行情、读取记忆、运行分析，并把观点写进聊天框和时间线。

### Agent 执行流程

```text
触发器启动
  -> 读取用户账户
  -> 读取当前持仓
  -> 获取行情数据
  -> 获取相关新闻/公告
  -> 读取用户记忆和偏好
  -> 读取系统提示词
  -> 调用 AI 模型
  -> 生成分析观点
  -> 写入 Agent 日志
  -> 写入聊天记录
  -> 如有风险，触发提醒
```

### Agent 输出格式

每次执行后，AI 应输出：

- 市场概况
- 持仓变化
- 风险提醒
- 机会观察
- 操作建议类型
  - 继续观察
  - 降低仓位
  - 等待确认
  - 止盈观察
  - 止损预警
- 置信度
- 需要用户确认的问题

### 示例输出

```text
14:50 自动巡检完成。

你的持仓总资产约 98,645.40 元，当前收益率 -1.35%。
今天主要拖累来自宁德时代，分时走势偏弱，量能没有明显放大。

我建议暂时不要急着加仓，先观察是否能重新站回 5 日均线。
如果明天继续放量下跌，需要重新评估仓位风险。

这不是买卖指令，只是基于当前数据的辅助分析。
```

---

## 3.7 记忆库模块

### 目标

让 AI 记住用户的投资风格、风险偏好、历史交易和特殊要求。

### 记忆类型

1. 用户偏好记忆
   - 风险承受能力
   - 偏好短线还是长线
   - 是否喜欢高股息
   - 是否回避创业板
   - 是否只做 A 股
2. 投资规则记忆
   - 单只股票最大仓位
   - 止损线
   - 止盈线
   - 不追高
   - 不做 ST
3. 持仓记忆
   - 为什么买入
   - 买入时的逻辑
   - 用户对股票的主观看法
4. 对话记忆
   - 用户之前问过什么
   - AI 之前给过什么观点
5. Agent 记忆
   - 最近几次巡检结论
   - 风险是否持续存在
   - 某只股票是否多次触发预警

### 技术实现

推荐两层记忆：

1. 结构化记忆
   - 存在数据库表中
   - 用于账户、持仓、规则、提醒
2. 向量记忆
   - 存在向量数据库中
   - 用于检索历史对话、交易理由、研报摘要

### 推荐向量数据库

- SQLite + sqlite-vec：适合本地轻量版
- Chroma：适合原型
- Qdrant：适合生产部署
- PostgreSQL + pgvector：适合长期扩展

---

## 3.8 提示词系统

### 目标

让 Agent 有稳定的角色、边界和输出格式。

### 系统提示词草案

```text
你是一个股票投资辅助 Agent，不是持牌投顾，不能承诺收益，不能替用户下单。
你的任务是帮助用户记录账户、分析持仓、识别风险、总结行情变化，并给出谨慎的辅助观点。

你必须遵守：
1. 所有观点都要说明依据。
2. 不得使用“必涨”“稳赚”“马上买入”等绝对化表达。
3. 涉及买卖时，必须提醒用户自行决策。
4. 如果数据不足，必须明确说明数据不足。
5. 如果用户输入包含账户变更、买入、卖出、提醒设置，先结构化解析，再等待用户确认。
6. 输出要简洁、可执行、带风险提示。
```

### Agent 分析提示词草案

```text
请基于以下信息分析用户当前持仓：

账户信息：
{{account_summary}}

持仓列表：
{{positions}}

行情数据：
{{market_data}}

相关新闻：
{{news}}

用户投资偏好：
{{user_preferences}}

历史 Agent 观点：
{{recent_agent_memories}}

请输出：
1. 账户概况
2. 个股变化
3. 主要风险
4. 值得观察的机会
5. 下一步建议
6. 置信度
7. 是否需要提醒用户

注意：不得给出确定性收益承诺，不得替用户做最终买卖决定。
```

---

## 4. 页面设计规划

## 4.1 应用整体布局

建议使用三栏或两栏工作台：

### 桌面端

```text
左侧导航栏 | 中间资产与持仓 | 右侧 AI 聊天与 Agent 时间线
```

### 移动端

```text
顶部模型状态
资产总览
持仓卡片
AI 聊天
Agent 时间线
底部导航
```

## 4.2 页面清单

| 页面 | 说明 |
| --- | --- |
| 首页工作台 | 展示账户、持仓、AI 聊天 |
| 持仓详情页 | 单只股票详细分析 |
| 交易记录页 | 买入、卖出、入金、出金 |
| Agent 设置页 | 定时任务、提醒规则、执行日志 |
| 记忆库页 | 用户偏好、投资规则、历史观点 |
| 模型设置页 | AI 厂商、模型、API Key |
| 数据源设置页 | 行情 API、新闻 API |
| 风控设置页 | 止盈止损、仓位上限、提醒方式 |

## 4.3 首页卡片设计

### 顶部模型条

- 在线状态点
- 当前模型名称
- 当前数据源
- 今日 Agent 执行次数
- 下次巡检时间

### 总览卡片

- 总资产
- 本金
- 现金
- 总收益
- 收益率
- 持仓数量

### 持仓卡片

每个股票一个卡片，视觉类似用户参考图：

```text
贵州茅台
600519.SH

持仓：300 股
成本：1680.00
现价：1652.30
市值：495690.00
浮盈：-8310.00
收益率：-1.65%

AI：等待企稳
```

### AI 聊天框

功能：

- 自然语言录入
- 查询账户
- 查询个股
- 设置提醒
- 设置 Agent 时间
- 展示 Agent 自动消息

### Agent 时间线

```text
14:50 自动巡检
风险：宁德时代跌破 5 日均线
建议：暂不加仓，等待量能确认

13:30 自动巡检
市场：创业板指数回落
建议：关注新能源板块分化
```

---

## 5. 技术架构建议

## 5.1 当前推荐技术路线：本地桌面应用

结合新的产品设想，第一版更推荐做成“可下载的本地桌面应用”，而不是传统网站。

核心原因：

- 用户下载后即可运行，不需要自己安装数据库、后端服务、Redis 等组件。
- API Key、持仓、聊天记录、Agent 记忆都可以保存在用户本机。
- 产品形态可以做得很像 Codex：左侧功能区，右侧聊天区，聊天和功能页面互相切换。
- 本地定时 Agent 更自然，可以在应用运行时自动巡检行情。
- 后续仍然可以升级为云同步版，但第一版不被云端账户体系拖慢。

### 最推荐组合

```text
桌面壳：Tauri
前端：React + TypeScript + Vite
UI：Tailwind CSS + shadcn/ui
本地数据：JSON 文件 + SQLite 可选
本地安全存储：系统 Keychain / Windows Credential Manager
定时任务：Tauri 后台任务 + 前端任务状态
行情接口：HTTP API，优先接入 AkShare 网关或第三方行情 API
AI 调用：前端发起请求或 Tauri 后端代理请求
```

### 为什么推荐 Tauri

Tauri 官方定位是创建小型、快速、安全、跨平台应用；它支持任意前端框架，前端可以继续用 React，应用逻辑用 Rust，并能打包 Windows、macOS、Linux，后续还可考虑移动端。Tauri 使用系统 WebView，安装包通常比 Electron 小很多，适合“别人下载后直接使用”的产品。

### 为什么不优先推荐 Electron

Electron 非常成熟，VS Code、Slack、Discord 这类产品都证明它能做复杂桌面应用。Electron 官方也说明它通过打包 Chromium 和 Node.js，让开发者用 JavaScript、HTML、CSS 创建跨平台桌面应用。

但对这个项目来说，Electron 的劣势是：

- 安装包更大。
- 内存占用通常更高。
- 需要更仔细处理 Node 权限和安全边界。

如果你想最快开发、团队只会 JavaScript，Electron 也可以。但如果目标是做一个轻量、像工具一样被下载使用的应用，Tauri 更合适。

### 关于“不使用数据库”

严格来说，可以不使用传统数据库服务器。这个需求完全合理。

建议分三层理解：

1. 不使用数据库服务：不需要 MySQL、PostgreSQL、MongoDB。
2. 不要求用户安装数据库：应用自己管理数据文件。
3. 内部是否使用 SQLite：可以作为可选实现，不暴露给用户。

SQLite 官方说明它是 serverless 的，程序直接读写磁盘文件，没有单独数据库服务器，也不需要安装、配置和管理数据库进程。因此，如果未来数据量变大，SQLite 其实很适合作为“本地文件型数据存储”，用户感知上仍然是“没有数据库”。

### 第一版建议

第一版可以先不用 SQLite，直接使用文件：

```text
用户数据目录/
  config.json
  accounts.json
  positions.json
  trades.json
  conversations/
    2026-07-04.json
  memories/
    preferences.json
    rules.json
    agent-notes.json
  agent-runs/
    2026-07-04.json
```

这样最容易让用户理解、备份、迁移。

当数据变复杂后，再升级：

```text
app-data.sqlite
attachments/
exports/
backups/
```

对用户来说仍然只是一个应用数据目录，不需要配置数据库。

## 5.2 Codex 风格界面结构

你想要的界面可以定义为“工作区 + Agent 聊天”的双模式布局。

### 默认布局

```text
左侧窄栏：功能导航
中间主区：当前功能页面
右侧面板：AI 聊天 / Agent 对话
```

### 功能导航

- 总览
- 持仓
- 交易
- Agent
- 记忆
- 模型
- 数据源
- 设置

### 交互规则

1. 默认打开时，右侧显示聊天。
2. 用户点击普通功能，例如“持仓”，中间显示持仓页面，右侧聊天仍可保留。
3. 用户点击需要全屏操作的功能，例如“模型设置”“Agent 设置”，聊天面板可以收起或消失。
4. 用户随时可以点击右上角聊天按钮，把聊天面板重新打开。
5. Agent 自动运行时，如果聊天面板关闭，左侧或顶部出现未读提醒。
6. 点击 Agent 消息，可以跳转到对应持仓、行情或任务详情。

### 推荐具体页面形态

```text
┌──────────────────────────────────────────────┐
│ 左侧功能栏 │ 主工作区                 │ AI 聊天 │
│ 总览      │ 资产卡片                 │         │
│ 持仓      │ 股票卡片                 │ 对话    │
│ 交易      │ Agent 时间线             │ 输入框  │
│ Agent     │                         │         │
│ 记忆      │                         │         │
│ 模型      │                         │         │
└──────────────────────────────────────────────┘
```

### 聊天消失后的功能模式

当用户进入专注功能页时：

```text
┌──────────────────────────────────────────────┐
│ 左侧功能栏 │ 大面积功能页面                  │
│            │ 例如：Agent 任务配置            │
│            │ 例如：模型 API Key 配置          │
│            │ 例如：记忆库管理                │
└──────────────────────────────────────────────┘
```

这会让产品更接近 Codex：聊天不是唯一入口，而是一个随时可召唤的助手。

## 5.3 MVP 技术栈

推荐先做 Web 应用：

| 层级 | 技术 |
| --- | --- |
| 前端 | React + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui |
| 图表 | ECharts 或 Recharts |
| 后端 | FastAPI 或 Node.js NestJS |
| 数据库 | PostgreSQL 或 SQLite |
| 定时任务 | APScheduler、Celery Beat 或 BullMQ |
| 行情获取 | AkShare、Yahoo Finance、Finnhub |
| AI 调用 | OpenAI SDK + 各厂商兼容接口 |
| 向量记忆 | pgvector、Chroma 或 sqlite-vec |

### 如果优先快速原型

建议：

- 前端：React + Vite
- 后端：FastAPI
- 数据库：SQLite
- 行情：AkShare
- 定时任务：APScheduler
- 记忆：SQLite 表 + Chroma

### 如果优先长期生产

建议：

- 前端：Next.js
- 后端：NestJS 或 FastAPI
- 数据库：PostgreSQL + pgvector
- 任务队列：Redis + BullMQ 或 Celery
- 部署：Docker Compose
- 日志：OpenTelemetry + Loki

---

## 6. 后端模块设计

## 6.1 服务拆分

```text
API Server
  - 用户与设置
  - 账户资产
  - 持仓交易
  - 聊天会话
  - Agent 控制

Market Data Service
  - 实时行情
  - K 线数据
  - 新闻公告

AI Gateway
  - 多厂商模型适配
  - Prompt 拼装
  - 工具调用
  - 结构化输出

Agent Scheduler
  - 定时任务
  - 条件触发
  - 执行日志

Memory Service
  - 结构化记忆
  - 向量检索
  - 历史观点召回
```

## 6.2 数据库表设计

### users

```sql
id
name
created_at
updated_at
```

### ai_providers

```sql
id
user_id
provider_name
base_url
api_key_encrypted
is_enabled
created_at
updated_at
```

### ai_models

```sql
id
provider_id
model_name
display_name
context_length
supports_tools
supports_json
is_default
created_at
updated_at
```

### accounts

```sql
id
user_id
name
initial_capital
cash_balance
currency
created_at
updated_at
```

### positions

```sql
id
account_id
symbol
stock_name
market
quantity
available_quantity
avg_cost
current_price
market_value
unrealized_pnl
unrealized_pnl_rate
ai_status
user_note
created_at
updated_at
```

### trades

```sql
id
account_id
position_id
symbol
trade_type
quantity
price
fee
trade_time
source
raw_user_input
created_at
```

### account_snapshots

```sql
id
account_id
snapshot_time
total_asset
cash_balance
position_market_value
total_pnl
total_pnl_rate
created_at
```

### conversations

```sql
id
user_id
title
model_provider
model_name
created_at
updated_at
```

### messages

```sql
id
conversation_id
role
content
message_type
metadata_json
created_at
```

### agent_jobs

```sql
id
user_id
name
job_type
cron_expression
interval_minutes
condition_json
is_enabled
next_run_at
created_at
updated_at
```

### agent_runs

```sql
id
job_id
user_id
status
started_at
finished_at
input_snapshot_json
output_summary
output_json
error_message
created_at
```

### memories

```sql
id
user_id
memory_type
title
content
importance
embedding_id
created_at
updated_at
```

### alerts

```sql
id
user_id
symbol
alert_type
condition_json
is_enabled
last_triggered_at
created_at
updated_at
```

---

## 7. API 设计草案

## 7.1 模型设置

```http
GET /api/ai/providers
POST /api/ai/providers
POST /api/ai/providers/test
GET /api/ai/models
POST /api/ai/default-model
```

## 7.2 账户

```http
GET /api/accounts/current
POST /api/accounts
PATCH /api/accounts/{id}
GET /api/accounts/{id}/summary
GET /api/accounts/{id}/snapshots
```

## 7.3 持仓

```http
GET /api/positions
POST /api/positions
PATCH /api/positions/{id}
DELETE /api/positions/{id}
POST /api/positions/refresh-prices
```

## 7.4 交易

```http
GET /api/trades
POST /api/trades/buy
POST /api/trades/sell
POST /api/trades/import
```

## 7.5 聊天

```http
GET /api/conversations
POST /api/conversations
GET /api/conversations/{id}/messages
POST /api/chat
POST /api/chat/confirm-action
```

## 7.6 Agent

```http
GET /api/agent/jobs
POST /api/agent/jobs
PATCH /api/agent/jobs/{id}
DELETE /api/agent/jobs/{id}
POST /api/agent/jobs/{id}/run-now
GET /api/agent/runs
GET /api/agent/runs/{id}
```

## 7.7 记忆

```http
GET /api/memories
POST /api/memories
PATCH /api/memories/{id}
DELETE /api/memories/{id}
POST /api/memories/search
```

---

## 8. AI 工具调用设计

AI Agent 可以使用以下工具：

### 账户工具

- get_account_summary
- update_initial_capital
- update_cash_balance
- create_account_snapshot

### 持仓工具

- list_positions
- add_position
- update_position
- delete_position
- match_stock_symbol

### 交易工具

- record_buy_trade
- record_sell_trade
- list_trades

### 行情工具

- get_realtime_quote
- get_kline_data
- get_market_index
- get_stock_news
- get_stock_announcement

### Agent 工具

- create_agent_job
- update_agent_job
- disable_agent_job
- run_agent_now

### 记忆工具

- save_memory
- search_memory
- list_user_rules
- update_user_preference

### 安全要求

高风险工具必须二次确认：

- 修改本金
- 修改现金
- 新增买入
- 新增卖出
- 删除持仓
- 删除交易记录
- 修改成本价
- 启用频繁 Agent 任务

---

## 9. Agent 决策边界

系统必须明确边界：

### Agent 可以做

- 记录用户输入
- 分析行情
- 总结新闻
- 比较持仓表现
- 提醒风险
- 给出观察建议
- 帮用户复盘
- 帮用户设置提醒
- 帮用户生成交易计划草稿

### Agent 不可以做

- 替用户下单
- 承诺收益
- 保证涨跌
- 隐瞒数据不确定性
- 把观点包装成确定结论
- 在用户未确认时修改关键账户数据
- 诱导用户高频交易

---

## 10. 风控与提醒系统

## 10.1 风控规则

用户可以设置：

- 单只股票最大仓位
- 单一行业最大仓位
- 最大可承受亏损
- 单日最大回撤提醒
- 个股止损线
- 个股止盈线
- 禁止买入名单
- 重点观察名单

## 10.2 提醒方式

MVP：

- 应用内提醒
- 聊天框自动消息

后续：

- 邮件
- 企业微信
- 钉钉
- Telegram
- 手机推送

## 10.3 提醒等级

- 信息：普通行情变化
- 注意：接近关键价格
- 警告：触发风控规则
- 严重：组合回撤或单股大幅波动

---

## 11. 安全与隐私

### API Key 安全

- API Key 不明文存储
- 使用本地密钥或环境变量加密
- 前端永不直接暴露 Key
- 后端代理模型调用

### 投资数据安全

- 账户数据本地优先
- 支持导出和备份
- 支持删除全部数据
- 敏感日志脱敏

### AI 调用安全

- 发给模型的数据最小化
- 不发送 API Key
- 不发送无关隐私数据
- 对模型输出做安全检查

---

## 12. MVP 版本范围

第一版不要做太大，建议先完成可用闭环。

### MVP 必做

- 选择 AI 厂商和模型
- 配置 API Key
- 聊天框输入持仓
- AI 结构化解析用户输入
- 用户确认后写入
- 本金、现金、总资产卡片
- 持仓卡片
- 手动刷新行情
- 每隔 N 分钟 Agent 自动分析
- Agent 结果写入聊天框
- Agent 执行日志
- 基础记忆：用户偏好、投资规则

### MVP 暂不做

- 自动交易
- 复杂量化回测
- 多账户管理
- 深度研报库
- 社区功能
- 手机 App
- 高频行情
- 复杂权限系统

---

## 13. 分阶段开发计划

## 阶段 0：需求确认与原型 ✅ 已完成

### 目标

确定系统边界和第一版形态。

### 任务

1. 明确主要市场：A 股、美股、港股，优先选一个。
2. 明确部署方式：本地应用、Web 服务、桌面应用。
3. 明确 AI 模型优先支持名单。
4. 明确行情数据源。
5. 画出首页工作台原型。
6. 确定 MVP 数据字段。
7. 写出系统提示词第一版。

### 交付物

- 产品需求文档
- 页面草图
- 数据库 ERD
- Prompt 草案
- 技术栈确认

---

## 阶段 1：项目骨架 ✅ 已完成（采用 Tauri + React 桌面架构，非传统前后端分离）

### 目标

搭建可运行的前后端基础。

### 任务

1. 初始化前端项目。
2. 初始化后端项目。
3. 配置数据库。
4. 配置环境变量。
5. 增加日志系统。
6. 增加基础错误处理。
7. 增加 API 请求封装。
8. 增加基础页面布局。

### 交付物

- 可启动前端
- 可启动后端
- 数据库连接成功
- 首页空状态页面

---

## 阶段 2：模型管理 ✅ 已完成

### 目标

让用户可以选择 AI 厂商和模型。

### 任务

1. 新建模型设置页。
2. 支持添加 API Key。
3. API Key 加密保存。
4. 支持模型列表配置。
5. 支持默认模型。
6. 支持测试模型连通性。
7. 后端封装统一 AI Gateway。
8. 增加模型调用日志。

### 交付物

- 模型设置界面
- 模型测试成功
- 统一 AI 调用接口

---

## 阶段 3：账户和持仓 ✅ 已完成

### 目标

完成资产卡片和持仓卡片。

### 任务

1. 新建账户表。
2. 新建持仓表。
3. 新建交易表。
4. 实现本金设置。
5. 实现现金设置。
6. 实现新增持仓。
7. 实现编辑持仓。
8. 实现删除持仓。
9. 实现资产计算。
10. 实现首页总览卡片。
11. 实现每只股票卡片。

### 交付物

- 可手动录入账户
- 可手动录入持仓
- 首页显示资产和持仓

---

## 阶段 4：聊天录入 ✅ 已完成

### 目标

让用户通过自然语言录入账户和持仓。

### 任务

1. 新建聊天会话表。
2. 新建消息表。
3. 实现聊天 UI。
4. 设计结构化抽取 Schema。
5. AI 解析用户输入。
6. 系统展示确认结果。
7. 用户确认后写入数据库。
8. 写入结果回显到聊天框。
9. 增加解析失败处理。

### 交付物

- 用户可以说“我买了什么股”
- AI 自动解析
- 用户确认后系统自动记录

---

## 阶段 5：行情接入 ⚠️ 部分完成（实时报价已接入新浪财经 via Tauri；K线/市场概况仍 mock）

### 目标

让持仓价格可以自动更新。

### 任务

1. 选择行情数据源。
2. 封装行情服务。
3. 实现股票代码匹配。
4. 实现实时价格查询。
5. 实现持仓批量刷新。
6. 计算浮盈浮亏。
7. 计算收益率。
8. 首页自动更新卡片。

### 交付物

- 当前价格可刷新
- 收益和收益率自动计算
- 持仓卡片展示实时结果

---

## 阶段 6：Agent 定时任务 ✅ 已完成（v0.1 React 定时器方案）

### 目标

实现用户设定激活时间后，Agent 自动运行。

### 任务

1. 新建 agent_jobs 表。
2. 新建 agent_runs 表。
3. 实现固定间隔任务。
4. 实现固定时间任务。
5. 实现任务启停。
6. 实现立即运行。
7. Agent 运行时读取账户。
8. Agent 运行时读取持仓。
9. Agent 运行时获取行情。
10. Agent 调用 AI 生成观点。
11. Agent 写入聊天消息。
12. Agent 写入执行日志。

### 交付物

- 用户可以设置每隔 1 小时运行
- 到点后自动分析
- 聊天框出现 AI 观点

---

## 阶段 7：记忆库 ✅ 已完成

### 目标

让 Agent 记住用户偏好和历史观点。

### 任务

1. 新建 memories 表。
2. 实现用户偏好保存。
3. 实现投资规则保存。
4. 实现历史观点保存。
5. 实现记忆检索。
6. Agent 分析前召回相关记忆。
7. 聊天时可以修改记忆。
8. 增加记忆管理页面。

### 交付物

- AI 知道用户偏好
- AI 能引用历史观点
- 用户能查看和删除记忆

---

## 阶段 8：风控与提醒 ⚠️ 部分完成（提醒规则已实现；系统通知未接入 Agent 流程）

### 目标

把 Agent 从“分析”升级为“监控”。

### 任务

1. 新建 alerts 表。
2. 支持价格提醒。
3. 支持涨跌幅提醒。
4. 支持收益率提醒。
5. 支持仓位提醒。
6. Agent 运行时检查风控规则。
7. 触发提醒后写入聊天框。
8. 提醒等级可视化。

### 交付物

- 用户可以说“跌破 1600 提醒我”
- 系统自动监控
- 触发时 AI 给出分析

---

## 阶段 9：复盘与报表 ⬜ 尚未开始

### 目标

帮助用户理解自己的交易表现。

### 任务

1. 每日账户快照。
2. 收益曲线。
3. 个股贡献分析。
4. 交易胜率。
5. 平均持仓周期。
6. AI 每日复盘。
7. AI 每周复盘。
8. 导出 Markdown 或 PDF。

### 交付物

- 每日复盘
- 每周复盘
- 可视化收益曲线

---

## 阶段 10：产品打磨 ⚠️ 进行中（空/加载/错误状态已做；API Key 安全已加固；备份恢复待完善）

### 目标

提升体验、稳定性和安全性。

### 任务

1. 空状态设计。
2. 加载状态设计。
3. 错误状态设计。
4. API Key 安全加固。
5. 任务失败重试。
6. 行情 API 限流。
7. 模型调用限流。
8. 数据备份和恢复。
9. 日志查看。
10. 用户手动导出数据。

### 交付物

- 稳定可长期使用的个人投资助手

---

## 14. 前端组件清单

### 基础组件

- AppShell
- Sidebar
- TopModelBar
- StatusDot
- MetricCard
- PositionCard
- ChatPanel
- ChatMessage
- AgentTimeline
- AgentJobEditor
- ModelSelector
- ApiKeyForm
- ConfirmActionDialog
- RiskBadge
- PriceChangeText
- EmptyState
- LoadingState

### 页面组件

- DashboardPage
- PositionDetailPage
- TradesPage
- AgentSettingsPage
- MemoryPage
- ModelSettingsPage
- DataSourceSettingsPage
- RiskSettingsPage

---

## 15. 推荐首页信息架构

```text
顶部：
AI 模型名称 | 数据源状态 | Agent 状态 | 下次运行时间

第一行：
总资产 | 本金 | 收益率 | 现金 | 回复/订单/成交

第二行：
持仓卡片列表

右侧：
AI 聊天框

底部：
Agent 时间线 + 今日提醒
```

---

## 16. 关键交互细节

### 16.1 AI 解析后的确认

用户输入：

```text
我买了 1000 股比亚迪，成本 245
```

系统回复：

```text
我准备记录一笔买入：
股票：比亚迪
数量：1000 股
成本价：245.00
预计占用资金：245000.00

是否确认写入？
```

按钮：

- 确认写入
- 修改
- 取消

### 16.2 Agent 定时任务设置

用户输入：

```text
每隔 1 小时帮我看一次。
```

系统回复：

```text
我准备创建一个 Agent 定时任务：
频率：每 1 小时
范围：当前全部持仓
内容：行情变化、风险提醒、操作观察
执行时间：交易时段内

是否启用？
```

按钮：

- 启用
- 只在交易时段启用
- 取消

### 16.3 风险提醒

触发后：

```text
风险提醒：贵州茅台跌破你设置的 1600 观察线。

当前价：1598.50
今日跌幅：-2.1%
你的成本价：1680.00
当前浮亏：-4.85%

我的看法：短线走势偏弱，需要观察是否快速收回 1600。
这不是卖出指令，建议你结合自己的计划确认是否调整。
```

---

## 17. 测试计划

### 单元测试

- 资产计算
- 收益率计算
- 成本价计算
- 自然语言解析结果校验
- Cron 表达式解析
- 风控规则判断

### 集成测试

- 聊天输入到数据库写入
- 行情刷新到持仓更新
- Agent 定时触发到聊天消息生成
- 模型切换到 AI Gateway 调用

### 端到端测试

1. 用户设置本金。
2. 用户输入买入股票。
3. AI 解析。
4. 用户确认。
5. 系统写入。
6. 行情刷新。
7. Agent 自动分析。
8. 聊天框展示观点。

---

## 18. 风险点

### 18.1 行情数据稳定性

免费数据源可能不稳定。需要：

- 缓存
- 重试
- 多数据源备用
- 明确更新时间

### 18.2 AI 幻觉

AI 可能编造数据。需要：

- 所有行情数字来自工具，不让模型凭空生成
- 模型输出中标注数据来源和时间
- 对关键字段做程序校验

### 18.3 投资合规

不能包装成自动荐股或保证收益。需要：

- 明确免责声明
- 不自动交易
- 买卖建议使用谨慎表达
- 用户确认所有关键操作

### 18.4 成本控制

定时 Agent 可能频繁调用模型。需要：

- 限制执行频率
- 只分析持仓
- 使用便宜模型做常规巡检
- 重要情况再调用强模型

---

## 19. 需要进一步确认的问题（已决策）

1. ✅ 第一版主要做 A 股（预留港股/美股扩展）。
2. ✅ Windows 桌面 GUI 应用（Tauri + React），非 Web 应用。
3. ✅ 数据存本地（AppData 目录 JSON），不上传云端。
4. ✅ 支持 OpenAI / Anthropic / Gemini / DeepSeek / 通义千问 / GLM / Kimi / Ollama / 自定义。
5. ✅ 第一版手动记录交易，后续可选券商导入。
6. ✅ Agent 视角以中长期持仓为主，兼顾短线风险提醒。
7. ✅ 第一版应用内提醒 + 系统通知（Tauri notification）。
8. ✅ 第一版单账户，后续支持多账户。
9. ⬜ 第一版只看价格和实时报价；新闻/公告 v0.4 接入。
10. ⬜ 每日观点导出复盘报告 v0.3+。

---

## 20. 推荐第一版开发顺序（实际完成情况）

最建议的顺序：

1. ✅ 先做静态首页 UI。
2. ✅ 做账户和持仓数据库。
3. ✅ 做手动录入。
4. ✅ 做 AI 聊天解析。
5. ✅ 做用户确认写入。
6. ✅ 做行情刷新。
7. ✅ 做 Agent 定时任务。
8. ✅ 做 Agent 聊天消息。
9. ✅ 做记忆库。
10. ⚠️ 做提醒和风控（规则已实现，通知未集成到 Agent 流程）。

原定顺序全部完成，v0.1 MVP 已交付。

---

## 21. 最小可行版本验收标准 ✅ 已达成

当以下事情都能完成，就算 MVP 成功：

1. ✅ 用户可以选择 AI 模型。
2. ✅ 用户可以输入本金。
3. ✅ 用户可以告诉 AI 买了什么股票。
4. ✅ AI 可以解析并让用户确认。
5. ✅ 系统可以显示总资产、本金、现金、收益。
6. ✅ 每只股票可以显示为一个卡片。
7. ✅ 用户可以设置“每隔 1 小时分析一次”。
8. ✅ Agent 到点后可以读取持仓和行情。
9. ✅ Agent 可以在聊天框生成分析观点。
10. ✅ 用户可以看到 Agent 历史执行记录。

---

## 22. 当前状态与后续计划

v0.1 MVP 已完成搭建。实际采用的技术方案与原建议有重大调整：

1. ✅ 第一版市场：A 股为主。
2. ✅ 产品形态：**Windows 桌面 GUI 应用**（Tauri + React），非 Web 应用。
3. ✅ 技术栈：**Tauri + React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Zustand + 本地 JSON**。
4. ✅ 高质量首页（Dashboard + 持仓卡片 + 聊天面板）已完成。
5. ✅ AI 解析 + Agent 定时任务已完成。

> ⚠️ 原建议的 React + FastAPI + SQLite + AkShare 方案已被 Tauri 全栈桌面方案取代。

后续优化方向详见：[优化建议.md](./优化建议.md) | [开发问题.md](./开发问题.md)

第一版已实现：

- ✅ 数据记得准
- ✅ 持仓看得清
- ✅ Agent 能按时醒来
- ✅ AI 观点有依据
- ✅ 用户始终能确认关键操作
