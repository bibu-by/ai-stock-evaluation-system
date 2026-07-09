// AI 聊天面板
import { useState, useRef, useEffect, useMemo } from "react";
import {
  Send,
  Bot,
  User,
  Info as SystemIcon,
  AlertTriangle,
  Loader2,
  PanelRightClose,
  Check,
  X,
  Pencil,
  Square,
  RotateCw,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/common/Markdown";
import { DimensionBadges } from "@/components/common/DimensionBadges";
import { DimensionRadarChart } from "@/components/common/DimensionRadarChart";
import { MiniKlineChartWrapper } from "@/components/common/MiniKlineChart";
import type { AnalysisDimensions } from "@/domain/agent";
import {
  defaultAiGateway,
  parseUserInput,
  getSessionUsage,
  resetSessionUsage,
} from "@/services/aiGateway";
import { matchSymbolByName, getBatchQuotes } from "@/services/marketData";
import { cn, uid, nowIso } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import type { ChatMessage, ParsedDraft } from "@/domain/chat";
import { buildSlidingWindowMessages } from "@/services/tokenEstimator";
import { ConversationSwitcher } from "@/components/app-shell/ConversationSwitcher";
import { SLIDING_WINDOW_MAX_TOKENS } from "@/domain/constants";

// 股票代码匹配（如 600519.SH / 000001.SZ / 830799.BJ）
const STOCK_CODE_REGEX = /\b(\d{6}\.(?:SH|SZ|BJ))\b/g;

export function ChatPanel() {
  // 使用 selector 按字段订阅，避免无关状态变更触发重渲染
  const allMessages = useAppStore((s) => s.messages);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateMessage = useAppStore((s) => s.updateMessage);
  const removeMessagesAfter = useAppStore((s) => s.removeMessagesAfter);
  const account = useAppStore((s) => s.account);
  const positions = useAppStore((s) => s.positions);
  const setChatMode = useAppStore((s) => s.setChatMode);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const runJobNow = useAppStore((s) => s.runJobNow);
  const defaultModel = useAppStore((s) => s.defaultModel);

  // 仅显示当前活跃会话的消息（useMemo 缓存，避免每次渲染都遍历全部消息）
  const messages = useMemo(
    () => allMessages.filter((m) => m.conversationId === activeConversationId),
    [allMessages, activeConversationId]
  );

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false); // 流式生成中
  const [editingId, setEditingId] = useState<string | null>(null); // 编辑态：正在编辑的 user 消息 id
  const abortRef = useRef<AbortController | null>(null);
  const [usage, setUsage] = useState(() => getSessionUsage());
  const scrollRef = useRef<HTMLDivElement>(null);
  const model = defaultModel();

  // 计算最后一条 user 消息 id（用于决定哪条消息显示"编辑"按钮）
  const lastUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].id;
    }
    return undefined;
  }, [messages]);

  // 每次 AI 调用完成后刷新底部 Token 用量
  const refreshUsage = () => setUsage(getSessionUsage());

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, loading]);

  // 标记 user 消息为已成功送达
  const markUserSent = async (userMessageId: string) => {
    await updateMessage(userMessageId, { status: "sent" });
  };

  // 标记 user 消息为失败（可重试）
  const markUserFailed = async (userMessageId: string, errorMessage: string) => {
    const userMsg = useAppStore.getState().messages.find((m) => m.id === userMessageId);
    await updateMessage(userMessageId, {
      status: "failed",
      metadata: { ...(userMsg?.metadata || {}), errorMessage },
    });
  };

  // 发送流程核心：解析意图 → 流式生成回复
  // userMessageId 为已写入的 user 消息 id，失败时用于标记状态和关联 error 消息
  const runSendPipeline = async (text: string, userMessageId: string) => {
    if (!model) {
      await addMessage({
        role: "system",
        type: "error",
        content: "未配置 AI 模型，请先在「模型」页面添加 API Key。",
        metadata: { relatedUserMessageId: userMessageId },
      });
      await markUserFailed(userMessageId, "未配置 AI 模型");
      setCurrentPage("model");
      return;
    }

    setLoading(true);
    try {
      // 第一阶段：调用 AI 解析理解意图
      const summary = account
        ? `累计投入本金 ${account.cumulativePrincipal}，现金 ${account.cashBalance}`
        : "未设置账户";
      const posText = positions
        .map((p) => `${p.name}(${p.symbol}) ${p.quantity}股 成本${p.avgCost}`)
        .join("\n");
      const draft = await parseUserInput(model, text, {
        accountSummary: summary,
        positions: posText,
      });
      refreshUsage();

      if (draft.requiresConfirmation) {
        // 写入确认卡片（不流式）
        await addMessage({
          role: "assistant",
          type: "confirmation",
          content: draft.summary,
          metadata: { intent: draft.intent, draft },
        });
        await markUserSent(userMessageId);
        return;
      }

      // 第二阶段：流式生成回复
      const msgId = await addMessage({
        role: "assistant",
        type: "text",
        content: "",
      });

      // 轻量级行情上下文注入：如果用户问到了具体股票，先获取实时行情
      let marketContext = "";
      if (draft.queriedSymbols && draft.queriedSymbols.length > 0) {
        try {
          const symbols = draft.queriedSymbols
            .map((s) => matchSymbolByName(s)?.symbol || s)
            .filter(Boolean);
          if (symbols.length > 0) {
            const quotes = await getBatchQuotes(symbols);
            const lines = symbols.map((sym) => {
              const q = quotes[sym];
              if (!q) return `${sym}: 行情获取失败`;
              return `${q.name}(${sym}) 现价 ${q.currentPrice} 今日 ${q.changeRate?.toFixed(2) || 0}%`;
            });
            marketContext = `\n- 用户询问的股票实时行情：\n${lines.join("\n")}`;
          }
        } catch (e) {
          // 行情获取失败不阻断聊天，只是不注入行情上下文
          console.warn("获取行情上下文失败：", e);
        }
      }

      const systemPrompt = `你是 AI 炒股评估系统的助手。用户刚才发送了一条消息，系统已经识别其意图。请基于以下信息给用户一个有帮助的、自然的中文回复：
- 用户原始输入：${text}
- 系统识别的意图：${draft.intent}
- 系统识别的摘要：${draft.summary}
${account ? `\n- 当前账户：累计投入本金 ${account.cumulativePrincipal}，现金 ${account.cashBalance}` : ""}
${positions.length > 0 ? `- 当前持仓：${positions.map((p) => `${p.name}(${p.symbol}) ${p.quantity}股 成本${p.avgCost}`).join("；")}` : ""}
${marketContext}

请基于以上信息回复用户。如果是查询类问题，给出简洁有用的分析；如果是闲聊，自然回应。注意：你是辅助工具，不能承诺收益或替用户做决策。`;

      const streamMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
        ...buildSlidingWindowMessages(
          useAppStore.getState().messages.filter(
            (m) => m.conversationId === useAppStore.getState().activeConversationId
          ),
          SLIDING_WINDOW_MAX_TOKENS
        )
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        { role: "user", content: text },
      ];

      abortRef.current = new AbortController();
      setStreaming(true);
      setLoading(false); // 隐藏 parse loader，进入流式展示

      let accumulated = "";
      try {
        const stream = defaultAiGateway.streamChat(model, streamMessages, {
          temperature: 0.6,
          maxTokens: 2048,
          signal: abortRef.current.signal,
        });
        for await (const chunk of stream) {
          accumulated += chunk.delta;
          await updateMessage(msgId, { content: accumulated });
        }
        refreshUsage();
        await markUserSent(userMessageId);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          await addMessage({
            role: "system",
            type: "error",
            content: `流式响应中断：${(e as Error).message}`,
            metadata: { relatedUserMessageId: userMessageId },
          });
          await markUserFailed(userMessageId, `流式响应中断：${(e as Error).message}`);
        } else {
          // AbortError：用户主动中止，已生成部分保留，视为成功
          await markUserSent(userMessageId);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    } catch (e) {
      await addMessage({
        role: "system",
        type: "error",
        content: `AI 调用失败：${(e as Error).message}`,
        metadata: { relatedUserMessageId: userMessageId },
      });
      await markUserFailed(userMessageId, `AI 调用失败：${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading || streaming) return;

    // 编辑模式：更新原消息内容并清空后续消息，再重新走发送流程
    if (editingId) {
      const orig = useAppStore.getState().messages.find((m) => m.id === editingId);
      if (orig) {
        await updateMessage(editingId, {
          content: text,
          status: "sending",
          metadata: { ...orig.metadata, errorMessage: undefined },
        });
        await removeMessagesAfter(editingId);
        setInput("");
        setEditingId(null);
        await runSendPipeline(text, editingId);
        return;
      }
      setEditingId(null);
    }

    // 正常发送
    setInput("");
    const userId = await addMessage({
      role: "user",
      type: "text",
      content: text,
      status: "sending",
    });
    await runSendPipeline(text, userId);
  };

  // 重试失败的 user 消息：重置状态、清空后续消息、重新走发送流程
  const retryMessage = async (userMessageId: string) => {
    if (loading || streaming) return;
    const userMsg = useAppStore.getState().messages.find((m) => m.id === userMessageId);
    if (!userMsg) return;
    await updateMessage(userMessageId, {
      status: "sending",
      metadata: { ...userMsg.metadata, errorMessage: undefined },
    });
    await removeMessagesAfter(userMessageId);
    await runSendPipeline(userMsg.content, userMessageId);
  };

  // 重新运行失败的 Agent 任务（复用 store 的 runJobNow）
  const rerunAgentJob = async (jobId: string) => {
    if (loading || streaming) return;
    await runJobNow(jobId);
  };

  // 进入编辑态：填充输入框并记录正在编辑的消息 id
  const startEdit = (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || loading || streaming) return;
    setInput(msg.content);
    setEditingId(messageId);
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingId(null);
    setInput("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex h-full flex-col bg-card/40">
      {/* 头部 */}
      <div className="flex h-11 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">AI 助手</span>
          {model ? (
            <Badge variant="secondary" className="text-[10px]">
              {model.modelName}
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px]">
              未配置
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ConversationSwitcher />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setChatMode("collapsed")}
            title="收起聊天"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3">
        <div className="flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              欢迎使用 AI 炒股助手。试试：
              <div className="mt-2 space-y-1">
                <div className="font-mono">"我本金 10 万，现金还剩 2 万"</div>
                <div className="font-mono">"我买了 300 股贵州茅台，成本 1680"</div>
                <div className="font-mono">"每隔 1 小时帮我分析一次"</div>
                <div className="font-mono">"如果茅台跌破 1600 提醒我"</div>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <MessageItem
              key={m.id}
              message={m}
              isLastUserMessage={m.id === lastUserMessageId}
              busy={loading || streaming}
              onConfirm={async () => {
                try {
                  await applyDraft(m);
                  await updateMessage(m.id, { metadata: { ...m.metadata, confirmed: true } });
                } catch (e) {
                  // 写入失败：显示错误消息，确认卡片保持可点击（方便处理后重试）
                  await addMessage({
                    role: "system",
                    type: "error",
                    content: `写入失败：${(e as Error).message}\n请先处理后再点击确认。`,
                  });
                }
              }}
              onReject={async () => {
                await updateMessage(m.id, { metadata: { ...m.metadata, rejected: true } });
              }}
              onRetry={(id) => void retryMessage(id)}
              onEdit={(id) => startEdit(id)}
              onRerunAgent={(jobId) => void rerunAgentJob(jobId)}
            />
          ))}
          {loading && !streaming && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在理解你的意图...
            </div>
          )}
        </div>
      </div>

      {/* 输入区 */}
      <div className="border-t border-border p-3">
        {editingId && (
          <div className="mb-2 flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-400">
            <span>正在编辑消息，发送后将清除该消息之后的回复并重新生成</span>
            <Button variant="ghost" size="icon-sm" onClick={cancelEdit} title="取消编辑">
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={editingId ? "编辑消息后按 Enter 重新发送" : "输入消息，Enter 发送，Shift+Enter 换行"}
          className="min-h-[60px] max-h-[160px] resize-none"
          disabled={streaming || loading}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          {/* Token 用量统计 / 模型状态 */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {usage.callCount > 0 ? (
              <>
                <span
                  className="rounded bg-secondary px-1.5 py-0.5 font-mono tabular-nums"
                  title={`输入 ${usage.promptTokens} / 输出 ${usage.completionTokens} / 调用 ${usage.callCount} 次`}
                >
                  本次会话 {usage.totalTokens.toLocaleString()} tokens
                </span>
                <span className="hidden sm:inline">
                  · {usage.callCount} 次调用
                </span>
              </>
            ) : model ? (
              <span className="font-mono text-emerald-400">
                就绪 · {model.modelName}
              </span>
            ) : (
              <span className="font-mono text-amber-400">
                未配置模型 ·{" "}
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  onClick={() => setCurrentPage("model")}
                >
                  去配置
                </button>
              </span>
            )}
            {usage.callCount > 0 && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  resetSessionUsage();
                  refreshUsage();
                }}
                title="清空 Token 计数"
              >
                重置
              </button>
            )}
          </div>
          {streaming ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => abortRef.current?.abort()}
            >
              <Square className="h-3.5 w-3.5" />
              停止生成
            </Button>
          ) : (
            <Button size="sm" onClick={() => void send()} disabled={loading || !input.trim()}>
              {editingId ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {editingId ? "更新" : "发送"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// 单条消息渲染
function MessageItem({
  message,
  isLastUserMessage,
  busy,
  onConfirm,
  onReject,
  onRetry,
  onEdit,
  onRerunAgent,
}: {
  message: ChatMessage;
  isLastUserMessage: boolean;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onRetry: (id: string) => void;
  onEdit: (id: string) => void;
  onRerunAgent: (jobId: string) => void;
}) {
  const isUser = message.role === "user";
  const isAgent = message.role === "agent";
  const isSystem = message.role === "system";
  const isConfirm = message.type === "confirmation";
  const isErr = message.type === "error";

  const confirmed = message.metadata?.confirmed;
  const rejected = message.metadata?.rejected;
  const failed = isUser && message.status === "failed";
  const relatedUserMessageId = message.metadata?.relatedUserMessageId;
  const agentJobId = message.metadata?.agentJobId;

  const Icon = isUser ? User : isAgent ? Bot : isSystem ? SystemIcon : Bot;
  const iconColor = isUser
    ? "text-primary"
    : isAgent
    ? "text-purple-400"
    : isErr
    ? "text-destructive"
    : "text-muted-foreground";

  // 是否需要显示操作按钮
  const showRetryOnUser = failed;
  const showEditOnUser = isUser && isLastUserMessage && !busy;
  const showRetryOnError = isErr && !!relatedUserMessageId;
  const showRerunAgent = isErr && !!agentJobId;
  const hasActions = showRetryOnUser || showEditOnUser || showRetryOnError || showRerunAgent;

  // 从 agent 消息内容中提取股票代码（如 600519.SH），用于渲染 K 线图
  const stockCodes = isAgent
    ? Array.from(message.content.matchAll(STOCK_CODE_REGEX)).map((m) => m[1])
    : [];
  const uniqueCodes = [...new Set(stockCodes)];

  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card",
          iconColor
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-1",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>
            {isUser ? "我" : isAgent ? "Agent" : isSystem ? "系统" : "AI"}
          </span>
          <span>{formatTime(message.createdAt)}</span>
          {failed && (
            <span className="text-destructive">· 发送失败</span>
          )}
        </div>
        <div
          className={cn(
            "rounded-md px-3 py-2 text-sm break-words",
            isUser
              ? cn(
                  "bg-primary/15 text-foreground whitespace-pre-wrap",
                  failed && "border border-destructive/40"
                )
              : isAgent
              ? "bg-purple-500/10 text-foreground border border-purple-500/20"
              : isErr
              ? "bg-destructive/10 text-foreground border border-destructive/30 whitespace-pre-wrap"
              : "bg-secondary text-foreground"
          )}
        >
          {isUser || isErr ? (
            message.content
          ) : (
            <Markdown content={message.content} />
          )}
        </div>

        {/* K 线图：agent 消息含股票代码时渲染（最多 3 个，失败静默降级） */}
        {isAgent && uniqueCodes.length > 0 && (
          <div className="mt-2 space-y-2">
            {uniqueCodes.slice(0, 3).map((code) => (
              <MiniKlineChartWrapper key={code} symbol={code} />
            ))}
          </div>
        )}

        {/* 多维度分析：5 维评分 badge + 雷达图（仅 agent_run 且有 dimensions 时渲染） */}
        {message.type === "agent_run" && !!message.outputJson?.dimensions && (
          <div className="mt-2 w-full space-y-2">
            <DimensionBadges
              dimensions={message.outputJson.dimensions as AnalysisDimensions}
            />
            <DimensionRadarChart
              dimensions={message.outputJson.dimensions as AnalysisDimensions}
            />
          </div>
        )}

        {/* 确认卡片按钮 */}
        {isConfirm && !confirmed && !rejected && (
          <div className="mt-1 flex gap-2">
            <Button size="sm" variant="success" onClick={onConfirm}>
              <Check className="h-3 w-3" />
              确认写入
            </Button>
            <Button size="sm" variant="outline" disabled>
              <Pencil className="h-3 w-3" />
              修改
            </Button>
            <Button size="sm" variant="ghost" onClick={onReject}>
              <X className="h-3 w-3" />
              取消
            </Button>
          </div>
        )}
        {isConfirm && (confirmed || rejected) && (
          <Badge variant={confirmed ? "success" : "destructive"} className="text-[10px]">
            {confirmed ? "已确认" : "已取消"}
          </Badge>
        )}

        {isErr && (
          <div className="flex items-center gap-1 text-[10px] text-destructive">
            <AlertTriangle className="h-3 w-3" />
            错误
          </div>
        )}

        {/* 操作按钮：重试 / 编辑 / 重新运行 */}
        {hasActions && (
          <div className={cn("flex flex-wrap gap-1", isUser ? "justify-end" : "justify-start")}>
            {showRetryOnUser && (
              <Button size="sm" variant="outline" onClick={() => onRetry(message.id)}>
                <RotateCw className="h-3 w-3" />
                重试
              </Button>
            )}
            {showEditOnUser && !failed && (
              <Button size="sm" variant="ghost" onClick={() => onEdit(message.id)}>
                <Pencil className="h-3 w-3" />
                编辑
              </Button>
            )}
            {showRetryOnError && relatedUserMessageId && (
              <Button size="sm" variant="outline" onClick={() => onRetry(relatedUserMessageId)}>
                <RotateCw className="h-3 w-3" />
                重试
              </Button>
            )}
            {showRerunAgent && agentJobId && (
              <Button size="sm" variant="outline" onClick={() => onRerunAgent(agentJobId)}>
                <RotateCw className="h-3 w-3" />
                重新运行
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 应用结构化草稿到 store
async function applyDraft(message: ChatMessage) {
  const draft = message.metadata?.draft as ParsedDraft | undefined;
  if (!draft) return;
  const store = useAppStore.getState();

  if (draft.account) {
    if (draft.account.cumulativePrincipal !== undefined) {
      await store.setInitialCapital(draft.account.cumulativePrincipal);
    }
    if (draft.account.cashBalance !== undefined) {
      await store.setCashBalance(draft.account.cashBalance);
    }
  }

  if (draft.positions?.length) {
    for (const p of draft.positions) {
      if (p.action === "sell") {
        // 简化：减仓逻辑第一版不实现完整，仅记录交易
        const matched = matchSymbolByName(p.name) || { symbol: p.symbol || p.name, name: p.name, market: "A_SHARE" };
        await store.addTrade({
          symbol: matched.symbol,
          name: matched.name,
          type: "SELL",
          quantity: p.quantity,
          price: p.avgCost || 0,
          fee: 0,
          amount: (p.avgCost || 0) * p.quantity,
          tradedAt: nowIso(),
          source: "ai_parse",
          rawInput: message.content,
        });
      } else {
        // buy / update
        const matched = matchSymbolByName(p.name) || { symbol: p.symbol || p.name, name: p.name, market: "A_SHARE" as const };
        // 根据用户语义透传 avgCost（单价）或 totalCost（总价），由 addPosition 内部统一计算
        // addPosition 内部已写入 BUY 交易记录（externalFunding 时附带自动入金 note）
        // 这里不再重复 addTrade，避免交易列表出现两条 BUY
        const costField =
          p.avgCost !== undefined
            ? { avgCost: p.avgCost, currentPrice: p.avgCost }
            : p.totalCost !== undefined
            ? { totalCost: p.totalCost, currentPrice: p.totalCost / p.quantity }
            : {};
        await store.addPosition({
          symbol: matched.symbol,
          name: matched.name,
          market: matched.market as "A_SHARE" | "HK" | "US" | "ETF" | "FUND",
          quantity: p.quantity,
          aiStatusText: "等待刷新",
          // AI 录入买入：视为从银行卡转入资金买入，自动累加本金，跳过现金校验
          externalFunding: true,
          ...costField,
        });
      }
    }
  }

  if (draft.agentJob) {
    await store.addAgentJob({
      name: draft.agentJob.name,
      enabled: true,
      triggerType: draft.agentJob.triggerType,
      intervalMinutes: draft.agentJob.intervalMinutes,
      fixedTimes: draft.agentJob.fixedTimes,
      scope: draft.agentJob.scope,
      symbol: draft.agentJob.symbol,
      // 透传 AI 解析的 tradingHoursOnly，默认 true（A 股周末/非交易时段不开盘）
      tradingHoursOnly: draft.agentJob.tradingHoursOnly ?? true,
    });
  }

  if (draft.alert) {
    await store.addAlert({
      name: draft.alert.name,
      enabled: true,
      condition: {
        symbol: draft.alert.symbol,
        metric: draft.alert.metric as "price" | "change_rate" | "pnl_rate" | "total_drawdown" | "position_ratio",
        operator: draft.alert.operator as "above" | "below" | "cross_up" | "cross_down",
        value: draft.alert.value,
      },
      level: "warning",
    });
  }

  if (draft.memory) {
    await store.addMemory({
      type: draft.memory.type as "preference" | "rule" | "stock_note" | "agent_note" | "conversation",
      title: draft.memory.title,
      content: draft.memory.content,
      importance: 3,
    });
  }

  // 写入系统确认消息
  await store.addMessage({
    id: uid("msg"),
    role: "system",
    type: "text",
    content: "已写入本地数据，可在对应页面查看。",
    createdAt: nowIso(),
  });
}
