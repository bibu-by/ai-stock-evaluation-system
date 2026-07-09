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
use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, WindowEvent,
};
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

/// 读取 config.closeToTray 设置。
/// 默认 true（关闭窗口时隐藏到托盘，Agent 保持运行）。
/// 任何读取/解析错误时回退到 true，保证后台运行不被意外打断。
fn read_close_to_tray(app: &tauri::AppHandle) -> bool {
    let path = match key_to_path(app, "config") {
        Ok(p) => p,
        Err(_) => return true,
    };
    if !path.exists() {
        return true;
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return true,
    };
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return true,
    };
    json.get("closeToTray")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
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

#[derive(Serialize, Deserialize, Clone)]
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
    // 基本面字段（腾讯财经补充，新浪不提供）
    pe_ttm: Option<f64>,
    pe_static: Option<f64>,
    pb: Option<f64>,
    market_cap_yi: Option<f64>,       // 总市值(亿)
    float_market_cap_yi: Option<f64>, // 流通市值(亿)
    turnover_rate: Option<f64>,       // 换手率%
    limit_up: Option<f64>,
    limit_down: Option<f64>,
    // 行情数据来源标识（"sina" / "tencent" / "sina+tencent"），供前端展示数据源
    source: Option<String>,
}

/// 腾讯财经返回字段（qt.gtimg.cn，GBK，~ 分隔 88 字段）
/// 字段索引参考 a-stock-data 实测校准（2026-05-03）
#[derive(Clone, Default)]
struct TencentQuoteFields {
    name: Option<String>,
    current_price: Option<f64>,
    prev_close: Option<f64>,
    open: Option<f64>,
    change_pct: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    amount_wan: Option<f64>, // 成交额(万)
    turnover_rate: Option<f64>,
    pe_ttm: Option<f64>,     // 索引 39
    market_cap_yi: Option<f64>,   // 索引 44
    float_market_cap_yi: Option<f64>, // 索引 45
    pb: Option<f64>,         // 索引 46（索引 43 是振幅%不是PB，常见踩坑）
    limit_up: Option<f64>,   // 索引 47
    limit_down: Option<f64>, // 索引 48
    pe_static: Option<f64>,  // 索引 52
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
        // 新浪不提供基本面字段，留空由腾讯补充
        pe_ttm: None,
        pe_static: None,
        pb: None,
        market_cap_yi: None,
        float_market_cap_yi: None,
        turnover_rate: None,
        limit_up: None,
        limit_down: None,
        source: Some("sina".to_string()),
    })
}

/// 把 600519.SH 转换为腾讯格式 sh600519（与新浪同前缀规则）
fn tencent_code(symbol: &str) -> String {
    if let Some(code) = symbol.strip_suffix(".SH") {
        format!("sh{}", code)
    } else if let Some(code) = symbol.strip_suffix(".SZ") {
        format!("sz{}", code)
    } else if let Some(code) = symbol.strip_suffix(".BJ") {
        format!("bj{}", code)
    } else if symbol.len() == 6 && symbol.chars().all(|c| c.is_ascii_digit()) {
        // 裸 6 位数字按 A 股规则推断前缀（与 sina_code 一致）
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

/// 解析 f64 字段，空串或解析失败返回 None
fn parse_f64_opt(s: &str) -> Option<f64> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return None;
    }
    trimmed.parse::<f64>().ok()
}

/// 调用腾讯财经批量行情 API（qt.gtimg.cn，GBK 编码，~ 分隔）
/// 返回 code -> TencentQuoteFields 映射，code 形如 "sh600519"
/// 字段索引参考 a-stock-data 实测校准（2026-05-03）
async fn fetch_tencent_quotes(
    client: &reqwest::Client,
    codes: &[String],
) -> Result<std::collections::HashMap<String, TencentQuoteFields>, String> {
    if codes.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    let url = format!("https://qt.gtimg.cn/q={}", codes.join(","));
    let res = client
        .get(&url)
        .header("Referer", "https://gu.qq.com/")
        .send()
        .await
        .map_err(|e| format!("腾讯行情请求失败: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("腾讯行情接口返回错误状态: {}", res.status()));
    }
    // 腾讯返回 GBK 编码，需手动解码
    let bytes = res.bytes().await.map_err(|e| format!("读取腾讯响应失败: {}", e))?;
    let (text, _, _) = encoding_rs::GBK.decode(&bytes);

    let mut result: std::collections::HashMap<String, TencentQuoteFields> = std::collections::HashMap::new();
    // 每条记录以 ';' 分隔，形如：v_sh600519="1~贵州茅台~600519~1688.88~..."
    for raw_line in text.split(';') {
        let line = raw_line.trim();
        if line.is_empty() || !line.contains('=') || !line.contains('"') {
            continue;
        }
        let eq_pos = match line.find('=') {
            Some(p) => p,
            None => continue,
        };
        // key 形如 v_sh600519，取最后一段 sh600519
        let key_part = &line[..eq_pos];
        let code = match key_part.rsplit('_').next() {
            Some(c) => c.trim().to_string(),
            None => continue,
        };
        // 取引号内内容
        let quote_start = match line[eq_pos..].find('"') {
            Some(p) => eq_pos + p + 1,
            None => continue,
        };
        let quote_end = match line[quote_start..].rfind('"') {
            Some(p) => quote_start + p,
            None => continue,
        };
        let body = &line[quote_start..quote_end];
        let vals: Vec<&str> = body.split('~').collect();
        if vals.len() < 53 {
            continue;
        }
        let fields = TencentQuoteFields {
            name: if vals.get(1).map(|s| s.is_empty()).unwrap_or(true) {
                None
            } else {
                Some(vals[1].to_string())
            },
            current_price: parse_f64_opt(vals.get(3).unwrap_or(&"")),
            prev_close: parse_f64_opt(vals.get(4).unwrap_or(&"")),
            open: parse_f64_opt(vals.get(5).unwrap_or(&"")),
            change_pct: parse_f64_opt(vals.get(32).unwrap_or(&"")),
            high: parse_f64_opt(vals.get(33).unwrap_or(&"")),
            low: parse_f64_opt(vals.get(34).unwrap_or(&"")),
            amount_wan: parse_f64_opt(vals.get(37).unwrap_or(&"")),
            turnover_rate: parse_f64_opt(vals.get(38).unwrap_or(&"")),
            pe_ttm: parse_f64_opt(vals.get(39).unwrap_or(&"")),
            market_cap_yi: parse_f64_opt(vals.get(44).unwrap_or(&"")),
            float_market_cap_yi: parse_f64_opt(vals.get(45).unwrap_or(&"")),
            pb: parse_f64_opt(vals.get(46).unwrap_or(&"")),
            limit_up: parse_f64_opt(vals.get(47).unwrap_or(&"")),
            limit_down: parse_f64_opt(vals.get(48).unwrap_or(&"")),
            pe_static: parse_f64_opt(vals.get(52).unwrap_or(&"")),
        };
        result.insert(code, fields);
    }
    Ok(result)
}

/// 用腾讯字段构造完整 QuotePayload（新浪失败时的 fallback 路径）
fn tencent_to_payload(symbol: &str, code: &str, f: &TencentQuoteFields) -> Option<QuotePayload> {
    let current_price = f.current_price?;
    let prev_close = f.prev_close.unwrap_or(0.0);
    let change_rate = if prev_close > 0.0 {
        (current_price - prev_close) / prev_close * 100.0
    } else {
        f.change_pct.unwrap_or(0.0)
    };
    // 成交量：腾讯只给成交额(万)，反推 volume 留空（前端 volume 字段非关键）
    Some(QuotePayload {
        symbol: symbol.to_string(),
        name: f.name.clone().unwrap_or_else(|| code.to_string()),
        current_price,
        prev_close,
        open: f.open.unwrap_or(0.0),
        high: f.high.unwrap_or(0.0),
        low: f.low.unwrap_or(0.0),
        change_rate,
        volume: 0.0,
        turnover: f.amount_wan.unwrap_or(0.0) * 10000.0,
        updated_at: chrono::Local::now().to_rfc3339(),
        pe_ttm: f.pe_ttm,
        pe_static: f.pe_static,
        pb: f.pb,
        market_cap_yi: f.market_cap_yi,
        float_market_cap_yi: f.float_market_cap_yi,
        turnover_rate: f.turnover_rate,
        limit_up: f.limit_up,
        limit_down: f.limit_down,
        source: Some("tencent".to_string()),
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

/// 批量行情：新浪为主（价格）+ 腾讯为辅（PE/PB/市值/换手率）+ fallback。
/// - 新浪拿价格/OHLC/成交量为主，腾讯拿 PE/PB/市值/换手率/涨跌停补充
/// - 新浪整体失败（网络/FAILED）时，用腾讯全字段兜底
/// - 两者都失败时返回明确错误，不伪造价格
#[tauri::command]
async fn get_batch_quotes(symbols: Vec<String>, client: tauri::State<'_, reqwest::Client>) -> Result<Vec<QuotePayload>, String> {
    if symbols.is_empty() {
        return Ok(Vec::new());
    }

    let sina_codes: Vec<String> = symbols.iter().map(|s| sina_code(s)).collect();
    let tencent_codes: Vec<String> = symbols.iter().map(|s| tencent_code(s)).collect();

    // 1. 调新浪（主，价格源）
    let mut sina_map: std::collections::HashMap<String, QuotePayload> = std::collections::HashMap::new();
    let mut sina_failed = false;
    match fetch_sina_quotes(&client, &symbols, &sina_codes).await {
        Ok(payloads) => {
            for p in payloads {
                sina_map.insert(p.symbol.clone(), p);
            }
        }
        Err(e) => {
            eprintln!("[get_batch_quotes] 新浪行情失败，改用腾讯兜底: {}", e);
            sina_failed = true;
        }
    }

    // 2. 始终调腾讯（补 PE/PB/市值 + 价格备份）
    let tencent_map = match fetch_tencent_quotes(&client, &tencent_codes).await {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[get_batch_quotes] 腾讯行情失败: {}", e);
            std::collections::HashMap::new()
        }
    };

    // 3. 合并
    let mut result = Vec::new();
    for (i, symbol) in symbols.iter().enumerate() {
        let tencent_code = &tencent_codes[i];
        let tencent_fields = tencent_map.get(tencent_code);

        if let Some(sina_payload) = sina_map.get(symbol) {
            // 新浪有数据：以新浪价格为主，补腾讯的基本面字段
            let mut merged = sina_payload.clone();
            let tencent_supplemented = if let Some(f) = tencent_fields {
                merged.pe_ttm = f.pe_ttm.or(merged.pe_ttm);
                merged.pe_static = f.pe_static.or(merged.pe_static);
                merged.pb = f.pb.or(merged.pb);
                merged.market_cap_yi = f.market_cap_yi.or(merged.market_cap_yi);
                merged.float_market_cap_yi = f.float_market_cap_yi.or(merged.float_market_cap_yi);
                merged.turnover_rate = f.turnover_rate.or(merged.turnover_rate);
                merged.limit_up = f.limit_up.or(merged.limit_up);
                merged.limit_down = f.limit_down.or(merged.limit_down);
                true
            } else {
                false
            };
            // 标记数据来源：新浪主 + 腾讯补基本面 → "sina+tencent"；仅新浪 → "sina"
            merged.source = Some(if tencent_supplemented {
                "sina+tencent".to_string()
            } else {
                "sina".to_string()
            });
            result.push(merged);
        } else if let Some(f) = tencent_fields {
            // 新浪该 symbol 缺失，用腾讯全字段兜底
            if let Some(payload) = tencent_to_payload(symbol, tencent_code, f) {
                result.push(payload);
            }
        }
        // 两者都无 → 跳过该 symbol
    }

    // 4. 两者都失败 → 明确报错
    if result.is_empty() && sina_failed && tencent_map.is_empty() {
        return Err("新浪与腾讯行情均失败，请检查网络或股票代码".to_string());
    }

    Ok(result)
}

/// 调用新浪批量行情，返回 QuotePayload 列表（价格为主，基本面字段为 None）
async fn fetch_sina_quotes(
    client: &reqwest::Client,
    symbols: &[String],
    codes: &[String],
) -> Result<Vec<QuotePayload>, String> {
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

// ====== K 线数据（腾讯 web.ifzq.gtimg.cn）======

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KlineBarPayload {
    time: String,
    open: f64,
    close: f64,
    high: f64,
    low: f64,
    volume: f64,
    ma5: Option<f64>,
    ma10: Option<f64>,
    ma20: Option<f64>,
}

/// 计算简单移动平均（SMA）：对 closes 数组每个位置 i，
/// 若 i >= window-1 则取 [i-window+1, i] 的均值，否则 None
fn compute_sma(closes: &[f64], window: usize) -> Vec<Option<f64>> {
    let mut result = Vec::with_capacity(closes.len());
    for i in 0..closes.len() {
        if window == 0 || i + 1 < window {
            result.push(None);
            continue;
        }
        let start = i + 1 - window;
        let sum: f64 = closes[start..=i].iter().sum();
        result.push(Some(sum / window as f64));
    }
    result
}

/// 获取 K 线数据（腾讯财经，前复权 K 线）
/// 支持 period="1d"（日 K）/ "1w"（周 K）/ "1M"（月 K）
#[tauri::command]
async fn get_kline(
    symbol: String,
    period: String,
    count: u32,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<Vec<KlineBarPayload>, String> {
    // 前端 period 映射到腾讯 fqkline 的 period 字段
    let tc_period = match period.as_str() {
        "1d" => "day",
        "1w" => "week",
        "1M" => "month",
        _ => return Err(format!("不支持的 K 线周期: {}，仅支持 1d/1w/1M", period)),
    };
    let tc = tencent_code(&symbol);
    let cnt = if count == 0 { 60 } else { count };
    // param=sh600519,day,,,60,qfq （前复权日 K，最近 60 根）
    // 注意：腾讯 fqkline 接口 param 为 6 段格式 {code},{period},{start},{end},{count},{fq}
    // 此前少写一个空段（end_date），导致 60 被当作 end_date、count 缺失，接口返回 param error。
    // 周 K/月 K 时 tc_period 为 week/month，接口返回的 key 名仍为 qfqday/day，解析逻辑不变。
    let url = format!(
        "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={},{},,,{},qfq",
        tc, tc_period, cnt
    );
    let res = client
        .get(&url)
        .header("Referer", "https://gu.qq.com/")
        .send()
        .await
        .map_err(|e| format!("K 线请求失败: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("K 线接口返回错误状态: {}", res.status()));
    }
    let data: serde_json::Value = res.json().await.map_err(|e| format!("解析 K 线响应失败: {}", e))?;

    // 响应路径：data.{tencent_code}.qfqday（前复权）或 data.{tencent_code}.day（不复权，fallback）
    let stock_obj = &data["data"][&tc];
    let kline_arr_owned: serde_json::Value = if let Some(v) = stock_obj.get("qfqday").or_else(|| stock_obj.get("day")) {
        v.clone()
    } else {
        // 尝试小写 key（部分返回中 tencent_code 大小写不一）
        let data_obj = match data.get("data").and_then(|d| d.as_object()) {
            Some(o) => o,
            None => return Err("K 线响应缺少 data 字段".to_string()),
        };
        // 找到第一个含 qfqday/day 的 stock key
        let mut found = None;
        for (_k, v) in data_obj.iter() {
            if let Some(arr) = v.get("qfqday").or_else(|| v.get("day")) {
                found = Some(arr.clone());
                break;
            }
        }
        match found {
            Some(arr) => arr,
            None => return Err(format!("K 线响应未找到 {} 的 qfqday/day 字段", tc)),
        }
    };
    let rows = match kline_arr_owned.as_array() {
        Some(a) => a,
        None => return Err("K 线数据格式异常：非数组".to_string()),
    };

    let mut bars: Vec<KlineBarPayload> = Vec::with_capacity(rows.len());
    let mut closes: Vec<f64> = Vec::with_capacity(rows.len());
    for row in rows {
        let arr = match row.as_array() {
            Some(a) => a,
            None => continue,
        };
        // [date, open, close, high, low, volume, ...]
        if arr.len() < 6 {
            continue;
        }
        let time = arr[0].as_str().unwrap_or("").to_string();
        let open = arr[1].as_str().and_then(|s| s.parse::<f64>().ok())
            .or_else(|| arr[1].as_f64())
            .unwrap_or(0.0);
        let close = arr[2].as_str().and_then(|s| s.parse::<f64>().ok())
            .or_else(|| arr[2].as_f64())
            .unwrap_or(0.0);
        let high = arr[3].as_str().and_then(|s| s.parse::<f64>().ok())
            .or_else(|| arr[3].as_f64())
            .unwrap_or(0.0);
        let low = arr[4].as_str().and_then(|s| s.parse::<f64>().ok())
            .or_else(|| arr[4].as_f64())
            .unwrap_or(0.0);
        let volume = arr[5].as_str().and_then(|s| s.parse::<f64>().ok())
            .or_else(|| arr[5].as_f64())
            .or_else(|| arr[5].as_u64().map(|v| v as f64))
            .unwrap_or(0.0);
        closes.push(close);
        bars.push(KlineBarPayload {
            time,
            open,
            close,
            high,
            low,
            volume,
            ma5: None,
            ma10: None,
            ma20: None,
        });
    }

    // 填充 MA5/MA10/MA20
    let ma5 = compute_sma(&closes, 5);
    let ma10 = compute_sma(&closes, 10);
    let ma20 = compute_sma(&closes, 20);
    for (i, bar) in bars.iter_mut().enumerate() {
        bar.ma5 = ma5[i];
        bar.ma10 = ma10[i];
        bar.ma20 = ma20[i];
    }

    Ok(bars)
}

// ====== 公告数据（东方财富）======

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnouncementItem {
    title: String,
    publish_time: String, // ISO 时间或日期字符串
    announcement_type: Option<String>, // 公告类型（如"财报"/"重大事项"）
    url: Option<String>,
}

/// 从 symbol（如 600519.SH / 000858.SZ）提取纯 6 位数字代码（如 600519）
fn pure_code(symbol: &str) -> String {
    if let Some(code) = symbol.strip_suffix(".SH") {
        code.to_string()
    } else if let Some(code) = symbol.strip_suffix(".SZ") {
        code.to_string()
    } else if let Some(code) = symbol.strip_suffix(".BJ") {
        code.to_string()
    } else {
        // 已是裸代码或其他格式，原样返回
        symbol.to_string()
    }
}

/// 获取股票最新公告列表（东方财富公告接口，JSONP 响应）
/// Agent 巡检时每只股票调用一次，频率低，暂不限流。
#[tauri::command]
async fn get_announcements(
    symbol: String,
    count: u32,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<Vec<AnnouncementItem>, String> {
    let code = pure_code(&symbol);
    let cnt = if count == 0 { 5 } else { count };
    let url = format!(
        "https://np-anotice-stock.eastmoney.com/api/security/ann?cb=jQuery&sr=-1&page_size={}&page_index=1&ann_type=A&client_source=web&stock_list={}",
        cnt, code
    );

    let res = client
        .get(&url)
        .header("Referer", "https://data.eastmoney.com/")
        .send()
        .await
        .map_err(|e| format!("公告请求失败: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("公告接口返回错误状态: {}", res.status()));
    }
    let text = res.text().await.map_err(|e| format!("读取公告响应失败: {}", e))?;

    // JSONP 响应形如 jQuery...({...})，需去除回调函数外壳。
    // 使用平衡括号扫描，正确处理 JSON 字符串内部可能包含的括号。
    let json_str = if let Some(start) = text.find('(') {
        let after = &text[start + 1..];
        let mut depth = 1;
        let mut end = after.len();
        for (i, c) in after.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = i;
                        break;
                    }
                }
                _ => {}
            }
        }
        &after[..end]
    } else {
        &text[..]
    };

    let data: serde_json::Value =
        serde_json::from_str(json_str).map_err(|e| format!("解析公告 JSON 失败: {}", e))?;

    let list = match data.get("data").and_then(|d| d.get("list")).and_then(|l| l.as_array()) {
        Some(arr) => arr,
        None => return Ok(Vec::new()),
    };

    let mut result: Vec<AnnouncementItem> = Vec::new();
    for item in list {
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if title.is_empty() {
            continue;
        }
        let publish_time = item
            .get("notice_date")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let announcement_type = item
            .get("ann_type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let url = item
            .get("art_code")
            .and_then(|v| v.as_str())
            .map(|art_code| {
                format!("https://data.eastmoney.com/notices/detail/{}/{}.html", code, art_code)
            });
        result.push(AnnouncementItem {
            title,
            publish_time,
            announcement_type,
            url,
        });
    }
    Ok(result)
}

// ====== 研报数据（东方财富）======

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResearchReport {
    title: String,
    org_name: String,           // 机构简称
    rating: Option<String>,     // 评级（如"买入"/"增持"/"中性"）
    publish_date: String,       // 发布日期 YYYY-MM-DD
    eps_forecast: Option<String>, // 三年 EPS 预测（拼接字符串，如"2026E:5.2 / 2027E:5.8"）
    summary: Option<String>,    // 摘要
}

/// 解析 predictNextTwoYearEps 字段（可能为 null / 数组 / 对象），拼接成字符串
fn format_eps_forecast(v: &serde_json::Value) -> Option<String> {
    if v.is_null() {
        return None;
    }
    // 数组形式：[{year, value}, ...]
    if let Some(arr) = v.as_array() {
        let parts: Vec<String> = arr
            .iter()
            .filter_map(|item| {
                let year = item
                    .get("year")
                    .and_then(|y| y.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| {
                        item.get("year")
                            .and_then(|y| y.as_i64())
                            .map(|n| n.to_string())
                    });
                let value = item
                    .get("value")
                    .and_then(|val| val.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| {
                        item.get("value")
                            .and_then(|val| val.as_f64())
                            .map(|n| n.to_string())
                    });
                match (year, value) {
                    (Some(y), Some(val)) => Some(format!("{}E:{}", y, val)),
                    _ => None,
                }
            })
            .collect();
        if parts.is_empty() {
            return None;
        }
        return Some(parts.join(" / "));
    }
    // 对象形式：{year: value, ...}
    if let Some(obj) = v.as_object() {
        let parts: Vec<String> = obj
            .iter()
            .filter_map(|(k, val)| {
                let val_str = val
                    .as_str()
                    .map(|s| s.to_string())
                    .or_else(|| val.as_f64().map(|n| n.to_string()));
                val_str.map(|vs| format!("{}E:{}", k, vs))
            })
            .collect();
        if parts.is_empty() {
            return None;
        }
        return Some(parts.join(" / "));
    }
    None
}

/// 获取个股研报列表（东方财富 reportapi）
/// qType=0 表示个股研报，code 传 6 位代码（不带市场前缀）
#[tauri::command]
async fn get_research_reports(
    symbol: String,
    count: u32,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<Vec<ResearchReport>, String> {
    let code = symbol.split('.').next().unwrap_or(&symbol);
    let cnt = if count == 0 { 10 } else { count };
    let url = format!(
        "https://reportapi.eastmoney.com/report/list?industryCode=*&pageSize={}&industry=*&rating=&ratingChange=&beginTime=&endTime=&pageNo=1&fields=&qType=0&orgCode=&code={}",
        cnt, code
    );

    let res = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .header("Referer", "https://data.eastmoney.com/")
        .send()
        .await
        .map_err(|e| format!("研报请求失败: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("研报接口返回错误状态: {}", res.status()));
    }
    let data: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("解析研报响应失败: {}", e))?;

    let list = match data.get("data").and_then(|d| d.as_array()) {
        Some(arr) => arr,
        None => return Ok(Vec::new()),
    };

    let mut result: Vec<ResearchReport> = Vec::new();
    for item in list {
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if title.is_empty() {
            continue;
        }
        let org_name = item
            .get("orgSName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let rating = item
            .get("emRatingName")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        // publishDate 形如 "2026-07-01T00:00:00" 或 "2026-07-01"，取前 10 位作为日期
        let publish_date = item
            .get("publishDate")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .get(..10)
            .unwrap_or("")
            .to_string();
        // predictNextTwoYearEps 可能为 null/数组/对象，统一交由 format_eps_forecast 处理
        let eps_forecast = item
            .get("predictNextTwoYearEps")
            .and_then(format_eps_forecast);
        let summary = item
            .get("contentSummary")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        result.push(ResearchReport {
            title,
            org_name,
            rating,
            publish_date,
            eps_forecast,
            summary,
        });
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
    // 系统托盘菜单：显示窗口 / 退出
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("show", "显示窗口"))
        .add_item(CustomMenuItem::new("quit", "退出"));

    let system_tray = SystemTray::new()
        .with_menu(tray_menu)
        .with_tooltip("AI 炒股评估系统");

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ensure_data_dirs,
            read_app_json,
            write_app_json,
            delete_app_json,
            export_all_data,
            clear_all_data,
            get_batch_quotes,
            get_kline,
            get_announcements,
            get_research_reports,
            save_api_key,
            read_api_key,
            delete_api_key,
            show_notification,
            call_ai_api,
        ])
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            // 左键点击托盘图标：显示并聚焦主窗口
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            // 右键菜单项点击
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| {
            // 拦截窗口关闭：根据 config.closeToTray 决定隐藏到托盘还是真正退出。
            // 默认 true（隐藏到托盘），保证 Agent 调度器在后台持续运行。
            if let WindowEvent::CloseRequested { api, .. } = event.event() {
                let close_to_tray = read_close_to_tray(&event.window().app_handle());
                if close_to_tray {
                    api.prevent_close();
                    let _ = event.window().hide();
                }
            }
        })
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
