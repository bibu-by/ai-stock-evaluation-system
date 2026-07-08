# 贡献指南

感谢你对 AI 炒股评估系统的兴趣！本文档说明如何在本地搭建开发环境并提交贡献。

## 开发环境

### 必备工具

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) stable 工具链
- Git
- Windows 10/11（macOS / Linux 理论支持但未充分测试）

### 启动项目

```bash
# 安装依赖
npm install

# 启动开发模式（Vite + Tauri 同时启动）
npm run tauri:dev
```

> Windows PowerShell 若提示执行策略受限，在当前会话执行：
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

### 常用脚本

| 命令 | 作用 |
|------|------|
| `npm run dev` | 仅启动前端 Vite（浏览器开发，无 Tauri 原生能力） |
| `npm run tauri:dev` | 启动 Tauri 桌面开发模式（推荐） |
| `npm run tauri:build` | 打包成安装程序 |
| `npm run build` | 仅构建前端产物 |
| `npm run test` | 运行单元测试（vitest） |
| `npm run test:watch` | 测试监听模式 |
| `npm run lint` | ESLint 检查 |
| `npm run lint:fix` | ESLint 自动修复 |

## 代码规范

### TypeScript

- 启用 `strict` 模式（含 `noUnusedLocals` / `noUnusedParameters`）
- 禁止 `any` 滥用（ESLint warn）
- 未使用变量需以 `_` 前缀（如 `_unused`）

### ESLint

```bash
npm run lint
```

规则要点：
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-unused-vars`: warn（`_` 前缀忽略）
- `react-hooks/rules-of-hooks`: error
- `react-hooks/exhaustive-deps`: warn
- `no-console`: warn（允许 `console.warn` / `console.error`）

### 代码格式化

项目根目录有 `.prettierrc`，建议提交前格式化：

```bash
npx prettier --write "src/**/*.{ts,tsx}"
```

### 错误处理约定

- 静默 `catch {}` 不可接受，至少需 `console.warn` 并附上下文
- Rust 代理失败需自动回退到前端 fetch（保证浏览器开发环境可用）
- 用户输入 / 外部 API 边界必须有 try/catch

## 项目结构

详见 [README.md](./README.md) 的「项目结构」章节。关键约定：

- `src/domain/` — 领域模型类型定义，保持纯粹（无副作用）
- `src/services/` — 业务服务（AI 网关、Agent 调度、行情、本地存储）
- `src/store/appStore.ts` — Zustand 全局状态
- `src-tauri/src/main.rs` — Rust 命令（数据读写 / 行情代理 / API Key / AI 代理）

## 提交 PR 的流程

1. Fork 本仓库并拉取到本地
2. 新建分支：`git checkout -b feat/your-feature`（或 `fix/your-fix`）
3. 保持小步提交，commit message 用中文或英文均可，但需说明「做了什么 + 为什么」
4. 确保以下检查通过：
   - `npm run lint` 无 error
   - `npm run test` 通过
   - `npm run build`（即 `tsc && vite build`）通过
5. 在 PR 描述中说明：改动范围、测试方式、是否影响现有功能
6. 涉及数据结构变更时，需考虑向后兼容（本地 JSON 数据迁移）

## 数据迁移注意

本地数据以 JSON 文件存储。修改 `domain/` 中的类型时：

- 新增字段尽量用可选（`field?: T`）
- `appStore.initApp` 中处理旧数据迁移（如无 conversations 时创建默认会话）
- Rust 端 `ALLOWED_KEYS` 需同步新增数据键

## 安全约定

- **API Key 不可写入 JSON 文件**，必须通过 `keyring` 存入系统凭据
- **API Key 不可进入前端 JS 内存**，AI 请求经 Rust `call_ai_api` 代理
- 行情数据通过 Rust `get_batch_quotes` 代理，避免浏览器 CORS

## Issue 反馈

提交 Issue 时请说明：

- 操作系统版本
- 复现步骤
- 期望行为 vs 实际行为
- 是否影响数据（数据丢失 / 错乱请优先标注）

## 行为准则

- 友善、尊重所有贡献者
- 不承诺收益、不诱导交易（与项目理念一致）
- AI 观点仅作辅助参考，不作为投资建议
