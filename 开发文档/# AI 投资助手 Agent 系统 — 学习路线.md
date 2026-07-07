# AI 投资助手 Agent 系统 — 学习路线

> 适用人群：刚毕业、希望彻底掌握本项目并应对面试的同学  
> 目标：能说清每个模块"为什么这样设计"和"遇到过什么坑"

---

## 一、项目技术栈全景

本项目是一个 **Windows 桌面 AI 投资助手**，采用前后端分离的桌面应用架构：

| 层级 | 技术 | 作用 |
|------|------|------|
| 桌面壳层 | Tauri 1.6 + Rust | 把 Web 前端打包成 .exe，提供系统级能力 |
| 前端界面 | React 18 + TypeScript | 用户界面、状态管理、业务逻辑 |
| 构建工具 | Vite 5 | 开发服务器、打包 |
| 样式 | Tailwind CSS 3.4 + shadcn/ui 风格组件 | 快速搭建金融工具风界面 |
| 状态管理 | Zustand 5.0.1 | 全局状态 + 持久化 |
| 图表 | Recharts 2.13 | 收益曲线、指标可视化 |
| Markdown | react-markdown 9.1 + remark-gfm | 渲染 AI 报告 |
| 后端命令 | Rust（Tauri Command） | 文件读写、行情代理、凭据存储、通知 |
| AI 模型 | OpenAI / Claude / Gemini / DeepSeek / Qwen / GLM / Kimi / Ollama | 多模型统一调用 |
| 数据源 | 新浪财经行情 API（Rust 代理） | 实时股价 |

---

## 二、你需要掌握的语言和技能清单

### 2.1 必学基础（没有捷径）

| 技能 | 掌握程度 | 为什么必须 |
|------|----------|------------|
| **JavaScript 基础** | 非常熟练 | React/TypeScript 的底层 |
| **TypeScript** | 熟练 | 项目全部用 TS 写，类型错误会直接拦住你 |
| **React 基础** | 熟练 | 组件、Hooks、状态、props |
| **HTML/CSS 基础** | 熟练 | Tailwind 本质是工具类 CSS |
| **命令行基础** | 会用 | npm install、git、tauri 命令 |
| **Git 版本控制** | 会用 | 协作和备份 |

### 2.2 进阶必学（本项目核心）

| 技能 | 掌握程度 | 为什么必须 |
|------|----------|------------|
| **React Hooks 深入** | 深入 | useState/useEffect/useMemo/useCallback 全部用到 |
| **异步编程** | 深入 | Promise/async/await/fetch，AI 调用全是异步 |
| **Rust 基础** | 能读懂 + 会写简单函数 | Tauri Command 和本地安全相关 |
| **Tauri 基础** | 了解架构 | 前后端怎么通信、Command 怎么暴露 |
| **Prompt Engineering** | 能设计结构化 Prompt | 意图解析、Agent 分析都靠它 |
| **JSON 和 API 调用** | 熟练 | 所有 AI 接口和数据都用 JSON |
| **基础金融概念** | 了解 | 持仓、成本价、市值、浮盈、收益率 |

### 2.3 加分项（面试亮点）

- 了解 SSE / Streaming 响应
- 了解浏览器 CORS 原理
- 了解系统凭据管理（Windows Credential Manager）
- 了解原子写入、路径穿越等安全概念

---

## 三、分阶段学习计划（建议 6-8 周）

### 阶段一：前端基础打底（1-2 周）

**学习内容：**

1. **HTML/CSS**
   - 盒模型、flex、grid 布局
   - 推荐：MDN 文档 + 写 2-3 个静态页面

2. **JavaScript 核心**
   - 变量、函数、对象、数组、解构
   - Promise、async/await、fetch
   - 闭包、this、原型链（面试常问）
   - 推荐：《JavaScript 高级程序设计》或 现代 JavaScript 教程

3. **TypeScript 入门**
   - 类型注解、接口 interface、类型别名 type
   - 泛型基础
   - 联合类型、可选属性、枚举
   - 推荐：官方 Handbook + 把 JS 项目改成 TS

**检验标准：** 能用 TS 写一个 TodoList，支持增删改查。

---

### 阶段二：React 深入（2-3 周）

**学习内容：**

1. **React 核心**
   - JSX、组件、props、state
   - useState、useEffect、useRef、useMemo、useCallback
   - 组件通信（父子、Context）
   - 条件渲染、列表渲染、表单处理

2. **React 进阶**
   - 自定义 Hooks
   - useReducer（Zustand 底层思想相关）
   - 性能优化（避免不必要的渲染）

3. **与项目结合**
   - 看懂 `src/App.tsx`、`src/store/appStore.ts`
   - 理解 Zustand 是怎么替代 Redux 的
   - 能解释为什么用单一 store 管理 12 个数据域

**检验标准：** 能独立实现一个带本地存储的记账本应用。

---

### 阶段三：Tailwind CSS + 组件库（1 周）

**学习内容：**

1. Tailwind 的 utility-first 思想
2. 常用类名：`flex`、`grid`、`p-4`、`rounded-lg`、`shadow`
3. 深色模式配置
4. 看懂 `src/components/ui/` 下的按钮、卡片、输入框组件

**检验标准：** 能复刻项目 Dashboard 首页的布局。

---

### 阶段四：Zustand 状态管理（1 周）

**学习内容：**

1. Zustand 基本用法：`create()` 创建 store
2. 多个 slice 如何组织
3. 持久化策略（本项目自己写，没用中间件）
4. 看懂 `src/store/appStore.ts` 中的 34 个 action

**重点问题：**
- Zustand 和 Redux 的区别？
- 为什么要用单一 store 而不是多个小 store？
- 本项目每次写操作为什么要立即持久化？

---

### 阶段五：Tauri + Rust 基础（2-3 周）

**学习内容：**

1. **Rust 基础语法**
   - 变量、所有权、借用、生命周期（重点）
   - 结构体、枚举、模式匹配
   - Result/Option 错误处理
   - 字符串、Vec、HashMap
   - 推荐：《Rust 程序设计语言》官方书

2. **Tauri 框架**
   - Tauri 架构：前端 + Rust 后端
   - `invoke` 调用 Rust Command
   - `#[tauri::command]` 暴露函数
   - 状态管理、事件系统
   - 推荐：Tauri 官方文档

3. **看懂项目 Rust 代码**
   - `src-tauri/src/main.rs`
   - 11 个 Command 分别做什么
   - 白名单机制怎么防路径穿越
   - keyring 怎么存 API Key
   - reqwest 怎么绕过 CORS

**检验标准：** 能在 Tauri 里新增一个 Rust Command，前端调用并返回值。

---

### 阶段六：AI Gateway 与多模型适配（1-2 周）

**学习内容：**

1. REST API 调用
   - fetch、headers、POST body
   - JSON 解析、错误处理
   - 超时和重试

2. OpenAI API 格式
   - messages 数组格式
   - role: system/user/assistant
   - temperature、max_tokens

3. 不同厂商的差异
   - Anthropic Messages API
   - Gemini generateContent
   - OpenAI Compatible 的共性

4. 看懂 `src/services/aiGateway.ts`
   - 统一接口设计
   - 26 个预置模型怎么配置
   - generateJson 的容错逻辑
   - Token 用量统计

**重点问题：**
- 为什么要封装统一接口？
- Anthropic 和 Gemini 与 OpenAI 格式有什么不同？
- JSON 输出不稳定时怎么处理？
- 新增一个模型 provider 需要改哪些地方？

---

### 阶段七：Agent 系统与 Prompt Engineering（1-2 周）

**学习内容：**

1. Agent 概念
   - 什么是 Agent？
   - 调度、上下文、执行、沉淀
   - 本项目 Agent 的 5 步流水线

2. Prompt Engineering
   - 角色设定、Few-shot、Chain-of-Thought
   - 结构化输出（JSON Schema 思想）
   - 系统 prompt 设计

3. 看懂代码
   - `src/services/agentRunner.ts`
   - `src/services/scheduler.ts`
   - `src/domain/ai.ts` 里的 PARSE_SYSTEM_PROMPT
   - `src/domain/agent.ts` 数据模型

**重点问题：**
- Agent 执行的完整流程是什么？
- 上下文里为什么需要"最近 5 条 agent_note 记忆"？
- 意图解析为什么要用确认闸门？
- Agent 输出为什么是结构化 JSON 而不是纯文本？

---

### 阶段八：数据安全与本地存储（1 周）

**学习内容：**

1. 本地存储方案对比
   - localStorage
   - IndexedDB
   - 本地文件
   - SQLite

2. 安全基础
   - 路径穿越攻击
   - API Key 怎么安全存储
   - CORS 是什么、为什么要绕过
   - 原子写入是什么

3. 看懂代码
   - `localStore.ts`
   - Rust 端 `write_app_json`
   - `keyring` 凭据管理

**重点问题：**
- 为什么 JSON 里不存 API Key 明文？
- key 白名单怎么防止路径穿越？
- tmp+rename 原子写入解决了什么问题？
- 浏览器 CORS 限制是什么，Tauri 怎么绕过？

---

## 四、按模块拆解面试高频问题

### 4.1 多模型网关模块

**可能问题：**

1. 你们支持哪些模型？
   - 答：9 家 provider，26 个预置模型。OpenAI/DeepSeek/Qwen/GLM/Kimi/Ollama/Custom 走 OpenAI Compatible，Anthropic 和 Gemini 需单独适配。

2. Anthropic 和 OpenAI 的 API 差异在哪？
   - 答：端点不同（/messages vs /chat/completions），认证头不同（x-api-key vs Authorization），system 消息处理方式不同（Anthropic 单独字段，OpenAI 是 role=system 的消息）。

3. 怎么处理 AI 返回的 JSON 格式不稳定？
   - 答：两层容错：先直接 JSON.parse，失败再尝试提取代码块或花括号里的 JSON 对象。

4. 新增一个模型 provider 要改多少代码？
   - 答：如果走 OpenAI Compatible，约 20 行配置（provider 信息 + baseURL + 模型列表）；如果协议差异大，需要新增适配函数。

---

### 4.2 意图解析模块

**可能问题：**

1. 自然语言是怎么转成结构化操作的？
   - 答：用户输入 + 当前账户持仓上下文拼成 prompt，调用 generateJson 返回 ParsedDraft，包含 intent、参数、requiresConfirmation。

2. 为什么设置确认闸门？
   - 答：AI 可能幻觉，如果直接写入会导致用户本金、持仓被误改。写操作必须用户确认后执行。

3. 支持哪些意图？
   - 答：9 类，包括 update_account、add_position、sell_position、update_position、create_agent_job、set_alert、save_memory、query、chat。

4. 如果 AI 解析错了怎么办？
   - 答：用户看到确认卡片后可以取消或修改，确认后才真正落盘。

---

### 4.3 Agent 调度模块

**可能问题：**

1. Agent 怎么触发？
   - 答：三类策略：固定间隔、固定时间、条件触发。v0.1 在前端用 setInterval 每 30 秒检查一次。

2. Agent 执行流程是什么？
   - 答：5 步——刷新行情 → 装配上下文 → 调用 AI → 输出报告 → 沉淀记忆。

3. 上下文里有什么？
   - 答：账户摘要、持仓快照、实时行情、用户偏好与投资规则、最近 5 条 Agent 记忆。

4. Agent 输出结构是怎样的？
   - 答：marketOverview、positionChanges、risks、opportunities、suggestionType（5 档）、suggestion、confidence、needUserConfirm、rawMarkdown。

---

### 4.4 记忆系统模块

**可能问题：**

1. 记忆分几类？
   - 答：5 类——preference、rule、stock_note、agent_note、conversation。

2. 怎么召回记忆？
   - 答：按类型过滤 + 时序排序。用户偏好和规则全部传入，Agent 历史只取最近 5 条。

3. 为什么不用向量数据库？
   - 答：v0.1 追求简单可靠，本地优先。预留了 tags/symbol/importance 字段，后续可升级语义检索。

4. 怎么形成闭环？
   - 答：执行 → 沉淀为 agent_note → 下次召回 → 参考，越用越贴合用户风格。

---

### 4.5 安全与存储模块

**可能问题：**

1. API Key 怎么存的？
   - 答：Rust 用 keyring crate 存入 Windows Credential Manager，前端 JSON 只存 apiKeyRef 引用。

2. 怎么防止数据被篡改路径？
   - 答：Rust 端维护 ALLOWED_KEYS 白名单，前端只能传这 12 个 key，不能传任意文件路径。

3. 写入文件怎么保证不损坏？
   - 答：先写 .tmp 临时文件，再用 fs::rename 原子替换。

4. 行情 API 为什么从 Rust 端调？
   - 答：浏览器有 CORS 限制，Rust 端直接发 HTTP 请求可绕过，同时避免在前端暴露反爬头。

---

## 五、推荐学习资源

### 5.1 官方文档（最权威）

- [MDN Web 文档](https://developer.mozilla.org/zh-CN/)
- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [React 官方文档](https://react.dev/)
- [Tailwind CSS 官方文档](https://tailwindcss.com/docs)
- [Zustand GitHub](https://github.com/pmndrs/zustand)
- [Tauri 官方文档](https://tauri.app/)
- [Rust 程序设计语言](https://kaisery.github.io/trpl-zh-cn/)
- [OpenAI API 文档](https://platform.openai.com/docs)

### 5.2 视频/课程

- B 站：React 入门到实战
- B 站：TypeScript 入门教程
- B 站：Rust 语言入门
- YouTube：Tauri 官方教程

### 5.3 练习项目

1. **TodoList（TS + React）** —— 练状态和类型
2. **记账本应用（React + localStorage）** —— 练持久化和 CRUD
3. **简单聊天机器人（调用 OpenAI API）** —— 练 AI 调用
4. **Tauri 桌面便签应用** —— 练前后端通信和文件读写

---

## 六、给应届生的建议

### 6.1 不要假装懂

面试官问到你不会的，诚实说"这个我还不太熟，但我理解它的作用是..."。应届生不懂很正常，但要有学习思路。

### 6.2 讲清楚"为什么"

不要只说"我用了 Zustand"，要说"因为项目数据域多但关系不复杂，Zustand 比 Redux 更轻量，一个 store 就能管理 12 个数据域"。

### 6.3 准备 3 个核心故事

1. 你是怎么处理 AI 输出不稳定的？（确认闸门 + JSON 容错）
2. 你是怎么保证用户数据安全的？（本地存储 + 凭据管理 + 白名单）
3. Agent 是怎么工作的？（调度 → 上下文 → AI → 报告 → 记忆）

### 6.4 把项目跑起来

能现场演示比背答案强 10 倍。确保你能：
- 运行 `npm run tauri:dev`
- 配置一个模型并连接成功
- 演示自然语言录入持仓
- 演示 Agent 手动运行

---

## 七、面试前自查清单

- [ ] 能解释 Tauri 前后端通信原理
- [ ] 能解释为什么选 Zustand
- [ ] 能画出 Agent 执行流程图
- [ ] 能说出 9 类意图和 7 类需确认操作
- [ ] 能解释确认闸门的设计原因
- [ ] 能解释多模型网关的适配策略
- [ ] 能解释 Rust 端的安全措施
- [ ] 能解释记忆召回策略
- [ ] 能现场跑通项目演示
- [ ] 能说出至少 2 个后续优化方向

---

## 八、一句话总结

> 这个项目的技术主线是：**React + TypeScript 做界面和状态，Zustand 管理数据，Tauri + Rust 做本地安全和系统能力，AI Gateway + Prompt Engineering 做智能层**。你按这个顺序学，边学边改代码，两个月就能讲清楚每个模块的难点。