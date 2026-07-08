// AI 炒股评估系统 - Tauri 主进程入口
// 这是 Windows 桌面 GUI 应用的原生能力层：
//   - 创建桌面窗口
//   - 管理本地文件（AppData 目录）
//   - 管理系统通知
//   - 管理 API Key 安全存储（系统凭据）
//   - 代理调用行情 HTTP API（避免浏览器 CORS）
// 前端通过 invoke 调用这些命令，不直接接触文件路径。

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use serde::{Deserialize, Serialize};

// 前端允许读写的 key 白名单，避免前端传任意路径导致安全问题。
const ALLOWED_KEYS: &[&str] = &[
    "config",
    "account",
    "positions",
    "trades",
    "models",
    "data-sources",
    "messages",
    "conversations",
    "agent-jobs",
    "agent-runs",
    "alerts",
    "memories",
    "account-snapshots",
];

const KEYRING_SERVICE: &str = "ai-stock-agent";

/// HTTP 请求超时（秒）
const HTTP_TIMEOUT_SECS: u64 = 30;

/// 构建共享的 reqwest::Client，复用连接池并统一超时
fn build_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .expect("构建 HTTP Client 失败")
}

#[derive(Serialize, Deserialize)]
struct AppDataPaths {
    data_dir: PathBuf,
    config: PathBuf,
    account: PathBuf,
    positions: PathBuf,
    trades: PathBuf,
    conversations: PathBuf,
    memories: PathBuf,
    agent_runs: PathBuf,
    backups: PathBuf,
}

fn get_data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
}

/// 校验 key 是否在白名单中
fn validate_key(key: &str) -> Result<(), String> {
    if ALLOWED_KEYS.contains(&key) {
        Ok(())
    } else {
        Err(format!("非法数据 key: {}", key))
    }
}

/// 把 key 映射到 AppData 下的安全文件路径
fn key_to_path(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
    validate_key(key)?;
    Ok(get_data_dir(app).join(format!("{}.json", key)))
}

#[tauri::command]
fn ensure_data_dirs(app: tauri::AppHandle) -> Result<AppDataPaths, String> {
    let data_dir = get_data_dir(&app);
    let conversations = data_dir.join("conversations");
    let memories = data_dir.join("memories");
    let agent_runs = data_dir.join("agent-runs");
    let backups = data_dir.join("backups");

    for dir in [&data_dir, &conversations, &memories, &agent_runs, &backups] {
        if !dir.exists() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
    }

    Ok(AppDataPaths {
        data_dir: data_dir.clone(),
        config: data_dir.join("config.json"),
        account: data_dir.join("account.json"),
        positions: data_dir.join("positions.json"),
        trades: data_dir.join("trades.json"),
        conversations,
        memories,
        agent_runs,
        backups,
    })
}

/// 读取 AppData 下指定 key 的 JSON 文件内容
#[tauri::command]
fn read_app_json(app: tauri::AppHandle, key: String) -> Result<String, String> {
    let path = key_to_path(&app, &key)?;
    if !path.exists() {
        return Ok(String::from(""));
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 写入 AppData 下指定 key 的 JSON 文件内容（原子写：先写 tmp 再 rename）
#[tauri::command]
fn write_app_json(app: tauri::AppHandle, key: String, content: String) -> Result<(), String> {
    let path = key_to_path(&app, &key)?;
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// 删除 AppData 下指定 key 的 JSON 文件
#[tauri::command]
fn delete_app_json(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let path = key_to_path(&app, &key)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 导出所有本地数据为单个 JSON 字符串（备份用）
#[tauri::command]
fn export_all_data(app: tauri::AppHandle) -> Result<String, String> {
    let mut map = serde_json::Map::new();
    map.insert(
        "exportedAt".to_string(),
        serde_json::Value::String(chrono::Local::now().to_rfc3339()),
    );
    for key in ALLOWED_KEYS {
        let path = key_to_path(&app, key)?;
        if path.exists() {
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let val: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::Value::Null);
            map.insert((*key).to_string(), val);
        } else {
            map.insert((*key).to_string(), serde_json::Value::Null);
        }
    }
    serde_json::to_string_pretty(&serde_json::Value::Object(map)).map_err(|e| e.to_string())
}

/// 清空所有本地数据（删除白名单内全部 JSON 文件）
#[tauri::command]
fn clear_all_data(app: tauri::AppHandle) -> Result<(), String> {
    for key in ALLOWED_KEYS {
        let path = key_to_path(&app, key)?;
        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[derive(Serialize, Deserialize)]
struct QuotePayload {
    symbol: String,
    name: String,
    current_price: f64,
    prev_close: f64,
    open: f64,
    high: f64,
    low: f64,
    change_rate: f64,
    volume: f64,
    turnover: f64,
    updated_at: String,
}

// ====== AI API 代理（非流式）======
// 前端只传 apiKeyRef 引用，由 Rust 从系统凭据读取真实 Key 后发起请求，Key 全程不离开 Rust 进程。

#[derive(Deserialize)]
struct ChatMessageArg {
    role: String,   // "system" | "user" | "assistant"
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CallAiApiArgs {
    provider: String,        // "openai" | "anthropic" | "gemini" | "deepseek" | "qwen" | "glm" | "kimi" | "ollama" | "custom"
    base_url: String,
    model_name: String,
    api_key_ref: String,     // keyring entry name
    messages: Vec<ChatMessageArg>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    json_mode: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CallAiApiUsage {
    prompt_tokens: u64,
    completion_tokens: u64,
    total_tokens: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CallAiApiResponse {
    content: String,
    finish_reason: String,
    usage: CallAiApiUsage,
}

/// 把 600519.SH 转换为新浪格式 sh600519
fn sina_code(symbol: &str) -> String {
    if let Some(code) = symbol.strip_suffix(".SH") {
        format!("sh{}", code)
    } else if let Some(code) = symbol.strip_suffix(".SZ") {
        format!("sz{}", code)
    } else if let Some(code) = symbol.strip_suffix(".BJ") {
        format!("bj{}", code)
    } else if symbol.len() == 6 && symbol.chars().all(|c| c.is_ascii_digit()) {
        // 裸 6 位数字（无市场后缀）按 A 股规则推断前缀，避免新浪返回 sys_auth="FAILED"
        if symbol.starts_with('6') {
            format!("sh{}", symbol)
        } else if symbol.starts_with('0') || symbol.starts_with('3') {
            format!("sz{}", symbol)
        } else if symbol.starts_with('8') || symbol.starts_with('4') {
            format!("bj{}", symbol)
        } else {
            symbol.to_lowercase()
        }
    } else {
        symbol.to_lowercase()
    }
}

/// 解析新浪行情返回文本
fn parse_sina_quote(symbol: &str, text: &str) -> Option<QuotePayload> {
    let line = text.lines().next()?;
    let start = line.find('"')? + 1;
    let end = line.rfind('"')?;
    let body = &line[start..end];
    let parts: Vec<&str> = body.split(',').collect();
    if parts.len() < 10 {
        return None;
    }
    let name = parts[0].to_string();
    let open = parts[1].parse::<f64>().ok()?;
    let prev_close = parts[2].parse::<f64>().ok()?;
    let current_price = parts[3].parse::<f64>().ok()?;
    let high = parts[4].parse::<f64>().ok()?;
    let low = parts[5].parse::<f64>().ok()?;
    let volume = parts[8].parse::<f64>().ok()?;
    let turnover = parts[9].parse::<f64>().ok()?;
    let change_rate = if prev_close > 0.0 {
        (current_price - prev_close) / prev_close * 100.0
    } else {
        0.0
    };
    Some(QuotePayload {
        symbol: symbol.to_string(),
        name,
        current_price,
        prev_close,
        open,
        high,
        low,
        change_rate,
        volume,
        turnover,
        updated_at: chrono::Local::now().to_rfc3339(),
    })
}

/// 代理非流式 AI API 调用：前端只传 apiKeyRef 引用，由 Rust 从系统凭据读取真实 Key 后发起请求。
/// 支持 OpenAI 兼容 / Anthropic / Gemini 三类厂商。
#[tauri::command]
async fn call_ai_api(args: CallAiApiArgs, client: tauri::State<'_, reqwest::Client>) -> Result<CallAiApiResponse, String> {
    // 1. 从系统凭据读 API Key
    let entry = keyring::Entry::new(KEYRING_SERVICE, &args.api_key_ref)
        .map_err(|e| format!("读取凭据失败: {}", e))?;
    let api_key = entry.get_password().map_err(|e| match e {
        keyring::Error::NoEntry => "未配置 API Key".to_string(),
        other => format!("读取 API Key 失败: {}", other),
    })?;

    // 2. 按 provider 分流（复用全局 Client）
    let provider = args.provider.as_str();
    if provider == "anthropic" {
        call_anthropic_api(&client, &args, &api_key).await
    } else if provider == "gemini" {
        call_gemini_api(&client, &args, &api_key).await
    } else {
        // openai / deepseek / qwen / glm / kimi / ollama / custom 均走 OpenAI 兼容协议
        call_openai_compatible_api(&client, &args, &api_key).await
    }
}

/// OpenAI 兼容厂商请求
async fn call_openai_compatible_api(
    client: &reqwest::Client,
    args: &CallAiApiArgs,
    api_key: &str,
) -> Result<CallAiApiResponse, String> {
    let url = format!("{}/chat/completions", args.base_url);
    let mut body = serde_json::json!({
        "model": args.model_name,
        "messages": args.messages.iter().map(|m| {
            serde_json::json!({ "role": m.role, "content": m.content })
        }).collect::<Vec<_>>(),
        "temperature": args.temperature.unwrap_or(0.6),
        "stream": false,
    });
    if let Some(max) = args.max_tokens {
        body["max_tokens"] = serde_json::json!(max);
    }
    if args.json_mode.unwrap_or(false) {
        body["response_format"] = serde_json::json!({ "type": "json_object" });
    }

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("AI API 请求失败: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(format!("AI API 错误：{} {}", status, &txt[..txt.len().min(200)]));
    }

    let data: serde_json::Value = res.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    let content = data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let finish_reason = data["choices"][0]["finish_reason"]
        .as_str()
        .unwrap_or("stop")
        .to_string();
    let usage = CallAiApiUsage {
        prompt_tokens: data["usage"]["prompt_tokens"].as_u64().unwrap_or(0),
        completion_tokens: data["usage"]["completion_tokens"].as_u64().unwrap_or(0),
        total_tokens: data["usage"]["total_tokens"].as_u64().unwrap_or(0),
    };
    Ok(CallAiApiResponse { content, finish_reason, usage })
}

/// Anthropic 请求（消息接口不同：system 单独传，messages 只含 user/assistant）
async fn call_anthropic_api(
    client: &reqwest::Client,
    args: &CallAiApiArgs,
    api_key: &str,
) -> Result<CallAiApiResponse, String> {
    let url = format!("{}/messages", args.base_url);
    let system_msg: String = args
        .messages
        .iter()
        .filter(|m| m.role == "system")
        .map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n");
    let user_messages: Vec<&ChatMessageArg> = args.messages.iter().filter(|m| m.role != "system").collect();

    let body = serde_json::json!({
        "model": args.model_name,
        "system": system_msg,
        "messages": user_messages.iter().map(|m| {
            serde_json::json!({ "role": m.role, "content": m.content })
        }).collect::<Vec<_>>(),
        "max_tokens": args.max_tokens.unwrap_or(1024),
        "temperature": args.temperature.unwrap_or(0.6),
    });

    let res = client
        .post(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic API 请求失败: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(format!("Anthropic API 错误：{} {}", status, &txt[..txt.len().min(200)]));
    }

    let data: serde_json::Value = res.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    let content = data["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let finish_reason = data["stop_reason"]
        .as_str()
        .unwrap_or("stop")
        .to_string();
    let input_tokens = data["usage"]["input_tokens"].as_u64().unwrap_or(0);
    let output_tokens = data["usage"]["output_tokens"].as_u64().unwrap_or(0);
    let usage = CallAiApiUsage {
        prompt_tokens: input_tokens,
        completion_tokens: output_tokens,
        total_tokens: input_tokens + output_tokens,
    };
    Ok(CallAiApiResponse { content, finish_reason, usage })
}

/// Gemini 请求（contents + parts 格式，Key 在 URL query 中）
async fn call_gemini_api(
    client: &reqwest::Client,
    args: &CallAiApiArgs,
    api_key: &str,
) -> Result<CallAiApiResponse, String> {
    let url = format!(
        "{}/models/{}:generateContent?key={}",
        args.base_url, args.model_name, api_key
    );
    let contents: Vec<_> = args
        .messages
        .iter()
        .map(|m| {
            let role = if m.role == "assistant" { "model" } else { "user" };
            serde_json::json!({
                "role": role,
                "parts": [{ "text": m.content }]
            })
        })
        .collect();
    let body = serde_json::json!({
        "contents": contents,
        "generationConfig": {
            "temperature": args.temperature.unwrap_or(0.6),
            "maxOutputTokens": args.max_tokens.unwrap_or(1024),
        }
    });

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gemini API 请求失败: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(format!("Gemini API 错误：{} {}", status, &txt[..txt.len().min(200)]));
    }

    let data: serde_json::Value = res.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    let content = data["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let finish_reason = data["candidates"][0]["finishReason"]
        .as_str()
        .unwrap_or("STOP")
        .to_string();
    let usage = CallAiApiUsage {
        prompt_tokens: data["usageMetadata"]["promptTokenCount"].as_u64().unwrap_or(0),
        completion_tokens: data["usageMetadata"]["candidatesTokenCount"].as_u64().unwrap_or(0),
        total_tokens: data["usageMetadata"]["totalTokenCount"].as_u64().unwrap_or(0),
    };
    Ok(CallAiApiResponse { content, finish_reason, usage })
}

/// 批量行情：Rust 直接调用新浪行情 HTTP API，避免浏览器 CORS。
/// 失败时返回错误，前端必须明确提示，不伪造价格。
#[tauri::command]
async fn get_batch_quotes(symbols: Vec<String>, client: tauri::State<'_, reqwest::Client>) -> Result<Vec<QuotePayload>, String> {
    if symbols.is_empty() {
        return Ok(Vec::new());
    }
    let codes: Vec<String> = symbols.iter().map(|s| sina_code(s)).collect();
    let url = format!("https://hq.sinajs.cn/list={}", codes.join(","));
    let res = client
        .get(&url)
        .header("Referer", "https://finance.sina.com.cn")
        .send()
        .await
        .map_err(|e| format!("行情请求失败: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("行情接口返回错误状态: {}", res.status()));
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    // 检测新浪认证失败：批量请求中包含无效代码时，新浪返回 sys_auth="FAILED" 并拒绝整个请求
    if text.contains("hq_str_sys_auth=\"FAILED\"") {
        return Err("行情接口认证失败：请检查股票代码格式（如 600169 需为 sh600169）".to_string());
    }
    let mut result = Vec::new();
    for (i, symbol) in symbols.iter().enumerate() {
        let code = &codes[i];
        // 在返回文本里定位该 code 对应的行
        let prefix = format!("hq_str_{}=", code);
        if let Some(pos) = text.find(&prefix) {
            let line_start = pos + prefix.len();
            if let Some(rel_end) = text[line_start..].find('\n') {
                let line = &text[line_start..line_start + rel_end];
                let trimmed = line.trim_end_matches(';').trim();
                let wrapped = format!("\"{}\"", trimmed);
                if let Some(q) = parse_sina_quote(symbol, &format!("var hq_str_{}={};", code, wrapped)) {
                    result.push(q);
                    continue;
                }
            }
        }
    }
    Ok(result)
}

// ====== API Key 安全存储（Windows Credential Manager / 系统凭据）======

/// 把 API Key 保存到系统安全凭据
#[tauri::command]
fn save_api_key(key_ref: String, api_key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key_ref).map_err(|e| e.to_string())?;
    entry.set_password(&api_key).map_err(|e| e.to_string())
}

/// 从系统安全凭据读取 API Key
#[tauri::command]
fn read_api_key(key_ref: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key_ref).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// 删除系统安全凭据中的 API Key
#[tauri::command]
fn delete_api_key(key_ref: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key_ref).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ====== 系统通知 ======

/// 弹出系统通知
#[tauri::command]
fn show_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    tauri::api::notification::Notification::new(&app.config().tauri.bundle.identifier)
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ensure_data_dirs,
            read_app_json,
            write_app_json,
            delete_app_json,
            export_all_data,
            clear_all_data,
            get_batch_quotes,
            save_api_key,
            read_api_key,
            delete_api_key,
            show_notification,
            call_ai_api,
        ])
        .setup(|_app| {
            // 注入共享 HTTP Client，供所有 command 复用连接池
            _app.manage(build_http_client());
            // 启动时确保数据目录存在
            let handle = _app.handle().clone();
            if let Err(e) = ensure_data_dirs(handle) {
                eprintln!("[ensure_data_dirs] {}", e);
            }
            #[cfg(debug_assertions)]
            {
                if let Some(window) = _app.get_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
