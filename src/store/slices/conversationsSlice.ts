// 会话域 Slice
// 管理 conversations / activeConversationId 及其创建/切换/重命名/删除。
// deleteConversation 跨域依赖 messages（删除会话时同步清理消息），通过 get() 访问完整 AppState。

import type { StateCreator } from "zustand";
import type { AppState, ConversationsSlice } from "../types";
import type { Conversation } from "@/domain/chat";
import { saveConversations, saveMessages } from "@/services/localStore";
import { uid, nowIso } from "@/lib/utils";

export const createConversationsSlice: StateCreator<AppState, [], [], ConversationsSlice> = (set, get) => ({
  conversations: [],
  activeConversationId: null,

  async createConversation() {
    const list = get().conversations.slice();
    const now = nowIso();
    // 标题格式「新会话 YYYY-MM-DD HH:mm」
    const d = new Date(now);
    const title = `新会话 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const conv: Conversation = {
      id: uid("conv"),
      title,
      createdAt: now,
      updatedAt: now,
    };
    list.push(conv);
    await saveConversations(list);
    set({ conversations: list, activeConversationId: conv.id });
  },

  async switchConversation(id) {
    set({ activeConversationId: id });
  },

  async renameConversation(id, title) {
    const list = get().conversations.map((c) =>
      c.id === id ? { ...c, title, updatedAt: nowIso() } : c
    );
    await saveConversations(list);
    set({ conversations: list });
  },

  async deleteConversation(id) {
    const list = get().conversations.filter((c) => c.id !== id);
    // 删除该会话的所有消息
    const msgs = get().messages.filter((m) => m.conversationId !== id);
    await saveConversations(list);
    await saveMessages(msgs);
    // 若删的是活跃会话，切换到第一个剩余会话；若无剩余，创建新空白会话
    let activeId = get().activeConversationId;
    if (activeId === id) {
      if (list.length > 0) {
        activeId = list[0].id;
      } else {
        // 无剩余会话，创建空白会话
        const now = nowIso();
        const d = new Date(now);
        const title = `新会话 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        const conv: Conversation = { id: uid("conv"), title, createdAt: now, updatedAt: now };
        list.push(conv);
        await saveConversations(list);
        activeId = conv.id;
      }
    }
    set({ conversations: list, messages: msgs, activeConversationId: activeId });
  },
});
