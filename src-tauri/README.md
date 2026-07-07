# AI 炒股 Agent - Tauri 桌面外壳

本项目是一款 Windows 桌面 GUI 应用：React 构建 GUI 界面，Tauri 把界面打包为真正的桌面程序。
桌面外壳负责本地文件读写、API Key 安全存储、系统通知、行情 HTTP 代理等原生能力。

## 开发

```bash
# 安装 Rust 工具链
# https://www.rust-lang.org/tools/install

# 在项目根目录运行
npm run tauri:dev
```

## 打包

```bash
npm run tauri:build
```

产物位于 `src-tauri/target/release/bundle/`，包含 nsis / msi 安装包。

## 提供的 Rust 命令

数据读写（key 白名单，前端不直接传文件路径）：

- `ensure_data_dirs` - 创建 AppData 数据目录结构
- `read_app_json(key)` - 读取 AppData 下指定 key 的 JSON
- `write_app_json(key, content)` - 原子写入 JSON（先写 tmp 再 rename）
- `delete_app_json(key)` - 删除指定 key 的 JSON 文件
- `export_all_data` - 导出全部本地数据为单个 JSON
- `clear_all_data` - 清空全部本地数据

行情代理（避免浏览器 CORS）：

- `get_batch_quotes(symbols)` - Rust 端调用行情 HTTP API 返回批量报价

API Key 安全存储（Windows Credential Manager）：

- `save_api_key(key_ref, api_key)` - 保存 API Key 到系统凭据
- `read_api_key(key_ref)` - 读取系统凭据中的 API Key
- `delete_api_key(key_ref)` - 删除系统凭据中的 API Key

系统通知：

- `show_notification(title, body)` - 弹出系统通知

## 允许的数据 key 白名单

```
config, account, positions, trades, models, data-sources,
messages, agent-jobs, agent-runs, alerts, memories
```
