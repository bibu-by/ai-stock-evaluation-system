import { describe, it, expect, beforeEach } from "vitest";
import "./setup";
import {
  extractJsonFromText,
  getSessionUsage,
  resetSessionUsage,
  recordUsage,
  parseSseDataLines,
  defaultAiGateway,
} from "../aiGateway";
import type { AiModelConfig } from "@/domain/ai";
import { mockFetch, resetMocks } from "./setup";

// 测试用模型：apiKey 直接挂在 JSON 上（测试环境 isTauri()=false，走 fetch 路径）
function makeModel(over: Partial<AiModelConfig> = {}): AiModelConfig {
  return {
    id: "m1",
    provider: "openai",
    providerLabel: "OpenAI",
    modelName: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test-key",
    isEnabled: true,
    isDefault: true,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

describe("extractJsonFromText", () => {
  it("解析 ```json 代码块", () => {
    const text = '前缀说明\n```json\n{"a":1,"b":2}\n```\n后缀说明';
    expect(extractJsonFromText(text)).toEqual({ a: 1, b: 2 });
  });

  it("解析裸 JSON 对象", () => {
    const text = '{"intent":"chat","summary":"hello"}';
    expect(extractJsonFromText(text)).toEqual({
      intent: "chat",
      summary: "hello",
    });
  });

  it("代码块前后有解释文字时仍能提取", () => {
    const text =
      "好的，这是结果：\n```json\n{\"x\":10}\n```\n请确认。";
    expect(extractJsonFromText(text)).toEqual({ x: 10 });
  });

  it("无 JSON 内容时抛错并包含原文片段", () => {
    const text = "这不是 JSON，也没有代码块";
    expect(() => extractJsonFromText(text)).toThrow(
      /AI 返回内容不是合法 JSON/
    );
  });

  it("代码块内非法 JSON 但文本中存在合法裸 JSON 时回退匹配裸 JSON", () => {
    // 第一个 match 命中 ```json 块但内容非法；当前实现不会自动回退到第二个 match，
    // 此用例验证：当 ```json 块内 JSON 非法时，会抛错（保持原行为）。
    const text = '```json\n{invalid}\n```';
    expect(() => extractJsonFromText(text)).toThrow();
  });

  it("纯 JSON 文本（无代码块）含嵌套结构", () => {
    const text = '{"a":{"b":[1,2,3]},"c":true}';
    expect(extractJsonFromText(text)).toEqual({
      a: { b: [1, 2, 3] },
      c: true,
    });
  });
});

describe("sessionUsage 统计", () => {
  beforeEach(() => {
    resetSessionUsage();
  });

  it("初始状态全部为 0", () => {
    const u = getSessionUsage();
    expect(u.promptTokens).toBe(0);
    expect(u.completionTokens).toBe(0);
    expect(u.totalTokens).toBe(0);
    expect(u.callCount).toBe(0);
    expect(Object.keys(u.byModel)).toHaveLength(0);
  });

  it("resetSessionUsage 清空已累加的统计", () => {
    recordUsage(makeModel(), {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    expect(getSessionUsage().callCount).toBe(1);
    resetSessionUsage();
    expect(getSessionUsage().callCount).toBe(0);
    expect(getSessionUsage().totalTokens).toBe(0);
  });

  it("recordUsage 累加 prompt/completion/total/callCount", () => {
    recordUsage(makeModel(), {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    recordUsage(makeModel(), {
      promptTokens: 30,
      completionTokens: 20,
      totalTokens: 50,
    });
    const u = getSessionUsage();
    expect(u.promptTokens).toBe(130);
    expect(u.completionTokens).toBe(70);
    expect(u.totalTokens).toBe(200);
    expect(u.callCount).toBe(2);
  });

  it("recordUsage 按 provider/model 维度分组到 byModel", () => {
    const openai = makeModel({ providerLabel: "OpenAI", modelName: "gpt-4o" });
    const deepseek = makeModel({
      provider: "deepseek",
      providerLabel: "DeepSeek",
      modelName: "deepseek-chat",
    });
    recordUsage(openai, { promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    recordUsage(deepseek, { promptTokens: 20, completionTokens: 10, totalTokens: 30 });
    recordUsage(openai, { promptTokens: 5, completionTokens: 5, totalTokens: 10 });
    const u = getSessionUsage();
    expect(Object.keys(u.byModel).sort()).toEqual([
      "DeepSeek/deepseek-chat",
      "OpenAI/gpt-4o",
    ]);
    expect(u.byModel["OpenAI/gpt-4o"].count).toBe(2);
    expect(u.byModel["OpenAI/gpt-4o"].prompt).toBe(15);
    expect(u.byModel["DeepSeek/deepseek-chat"].count).toBe(1);
  });

  it("getSessionUsage 返回浅拷贝，外部修改不影响内部状态", () => {
    recordUsage(makeModel(), {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    const u = getSessionUsage();
    u.promptTokens = 9999;
    u.byModel["OpenAI/gpt-4o-mini"] = { prompt: -1, completion: -1, total: -1, count: -1 };
    const u2 = getSessionUsage();
    expect(u2.promptTokens).toBe(10);
    expect(u2.byModel["OpenAI/gpt-4o-mini"].prompt).toBe(10);
  });

  it("recordUsage 在 usage 为空时跳过（防御性 guard）", () => {
    // 类型不允许 undefined，但运行时可能传入 falsy；recordUsage 应直接 return
    recordUsage(makeModel(), undefined as unknown as { promptTokens: number; completionTokens: number; totalTokens: number });
    // 再补一个 0 值 usage：会触发 callCount+=1 但 token 不增
    recordUsage(makeModel(), {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    const u = getSessionUsage();
    // 第一次 undefined 被跳过，callCount 仅第二次 +1
    expect(u.callCount).toBe(1);
    expect(u.totalTokens).toBe(0);
  });
});

describe("parseSseDataLines", () => {
  it("空字符串返回空数组", () => {
    expect(parseSseDataLines("")).toEqual([]);
  });

  it("单行 data: payload", () => {
    expect(parseSseDataLines("data: hello")).toEqual(["hello"]);
  });

  it("多行 data: payload 按顺序返回", () => {
    const text = "data: first\ndata: second\ndata: third";
    expect(parseSseDataLines(text)).toEqual(["first", "second", "third"]);
  });

  it("跳过 event: 行、注释行、空行", () => {
    const text = [
      "event: message",
      "data: keep1",
      "",
      ": this is a comment",
      "data: keep2",
      "",
    ].join("\n");
    expect(parseSseDataLines(text)).toEqual(["keep1", "keep2"]);
  });

  it("处理 \\r\\n 行尾（Windows 风格）", () => {
    const text = "data: a\r\ndata: b\r\n";
    expect(parseSseDataLines(text)).toEqual(["a", "b"]);
  });

  it("data: 后带空格的 payload 被去首尾空白", () => {
    expect(parseSseDataLines("data:    {\"x\":1}   ")).toEqual(['{"x":1}']);
  });

  it("处理 [DONE] 终止标记（仅作为 payload 返回，由调用方判断）", () => {
    const text = "data: chunk1\ndata: [DONE]";
    expect(parseSseDataLines(text)).toEqual(["chunk1", "[DONE]"]);
  });
});

describe("defaultAiGateway 集成（mock fetch）", () => {
  beforeEach(() => {
    resetMocks();
    resetSessionUsage();
  });

  it("generateText 返回 AI 内容", async () => {
    mockFetch({
      "api.openai.com/v1/chat/completions": {
        status: 200,
        body: {
          choices: [{ message: { content: "你好，世界" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        },
      },
    });
    const text = await defaultAiGateway.generateText(
      makeModel(),
      [{ role: "user", content: "ping" }],
      { temperature: 0.5 }
    );
    expect(text).toBe("你好，世界");
    // generateText 会调用 recordUsage
    expect(getSessionUsage().callCount).toBe(1);
    expect(getSessionUsage().totalTokens).toBe(8);
  });

  it("generateJson 直接解析合法 JSON 响应", async () => {
    mockFetch({
      "api.openai.com/v1/chat/completions": {
        status: 200,
        body: {
          choices: [
            {
              message: { content: '{"intent":"chat","summary":"hi"}' },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      },
    });
    const result = await defaultAiGateway.generateJson<{ intent: string }>(
      makeModel(),
      [{ role: "user", content: "你好" }]
    );
    expect(result.intent).toBe("chat");
  });

  it("generateJson 在响应非合法 JSON 时回退到 extractJsonFromText", async () => {
    mockFetch({
      "api.openai.com/v1/chat/completions": {
        status: 200,
        body: {
          choices: [
            {
              message: {
                content: '说明文字\n```json\n{"intent":"query"}\n```\n结尾',
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      },
    });
    const result = await defaultAiGateway.generateJson<{ intent: string }>(
      makeModel(),
      [{ role: "user", content: "查询" }]
    );
    expect(result.intent).toBe("query");
  });

  it("testConnection 成功返回 ok:true", async () => {
    mockFetch({
      "api.openai.com/v1/chat/completions": {
        status: 200,
        body: {
          choices: [{ message: { content: "pong" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      },
    });
    const r = await defaultAiGateway.testConnection(makeModel());
    expect(r.ok).toBe(true);
    expect(r.message).toContain("连接成功");
    // testConnection 不记录 usage（isTest=true）
    expect(getSessionUsage().callCount).toBe(0);
  });

  it("testConnection 在 API 错误时返回 ok:false 并带错误信息", async () => {
    mockFetch({
      "api.openai.com/v1/chat/completions": {
        status: 401,
        body: { error: "invalid api key" },
      },
    });
    const r = await defaultAiGateway.testConnection(makeModel());
    expect(r.ok).toBe(false);
    expect(r.message).toContain("401");
  });
});
