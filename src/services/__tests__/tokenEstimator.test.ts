import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  estimateMessageTokens,
  buildSlidingWindowMessages,
} from "../tokenEstimator";
import type { ChatMessage } from "@/domain/chat";

function makeMsg(content: string, id = "1"): ChatMessage {
  return {
    id,
    conversationId: "c1",
    role: "user",
    type: "text",
    content,
    createdAt: new Date().toISOString(),
  };
}

describe("estimateTokens", () => {
  it("空字符串返回 0", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("按字符数/2 向上取整", () => {
    expect(estimateTokens("ab")).toBe(1);
    expect(estimateTokens("abc")).toBe(2); // ceil(3/2)
    expect(estimateTokens("abcd")).toBe(2);
  });
});

describe("estimateMessageTokens", () => {
  it("在内容 token 基础上加 4（role 开销）", () => {
    const msg = makeMsg("ab"); // 1 token
    expect(estimateMessageTokens(msg)).toBe(5);
  });
});

describe("buildSlidingWindowMessages", () => {
  it("空数组返回空", () => {
    expect(buildSlidingWindowMessages([], 100)).toEqual([]);
  });

  it("从最新向前累加，不超过 maxTokens", () => {
    const msgs = [
      makeMsg("aaaa", "1"), // 2 + 4 = 6
      makeMsg("bbbb", "2"), // 2 + 4 = 6
      makeMsg("cccc", "3"), // 2 + 4 = 6
    ];
    // 限制 12 token：应保留最后 2 条（6+6=12）
    const result = buildSlidingWindowMessages(msgs, 12);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("2");
    expect(result[1].id).toBe("3");
  });

  it("始终保留最后一条，即使单独超出阈值", () => {
    const msgs = [
      makeMsg("x".repeat(100), "1"),
      makeMsg("y".repeat(100), "2"),
    ];
    const result = buildSlidingWindowMessages(msgs, 10);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });
});
