// Token 估算与滑动窗口工具
// 粗略估算：中文字符按 1 token，英文按 0.25 token（即字符数/4），混合取字符数/2 折中
import type { ChatMessage } from "@/domain/chat";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // 粗略估算：总字符数 / 2（中文为主场景的折中值）
  return Math.ceil(text.length / 2);
}

// 估算单条消息的 token 数（含 role 开销约 4 token）
export function estimateMessageTokens(msg: ChatMessage): number {
  return estimateTokens(msg.content) + 4;
}

// 滑动窗口：从最新消息向前累加，截取不超过 maxTokens 的最近 N 条
// 始终保留最后一条（最新用户消息），即使单独超出阈值
export function buildSlidingWindowMessages(
  messages: ChatMessage[],
  maxTokens: number
): ChatMessage[] {
  if (messages.length === 0) return [];
  let total = 0;
  const result: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = estimateMessageTokens(messages[i]);
    if (total + t > maxTokens && result.length > 0) {
      break;
    }
    total += t;
    result.unshift(messages[i]);
  }
  return result;
}
