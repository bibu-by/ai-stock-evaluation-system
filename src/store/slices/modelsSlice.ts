// 模型域 Slice
// 管理 models 及其增删改 / 默认模型查询。
// removeModel 会清理系统凭据中残留的 API Key。

import type { StateCreator } from "zustand";
import type { AppState, ModelsSlice } from "../types";
import type { AiModelConfig } from "@/domain/ai";
import { saveModels, deleteApiKey } from "@/services/localStore";
import { uid, nowIso } from "@/lib/utils";

export const createModelsSlice: StateCreator<AppState, [], [], ModelsSlice> = (set, get) => ({
  models: [],

  async addModel(m) {
    const list = get().models.slice();
    const newM: AiModelConfig = {
      ...m,
      id: uid("model"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    // 如果设为默认，取消其他默认
    if (newM.isDefault) {
      for (const item of list) item.isDefault = false;
    }
    list.push(newM);
    await saveModels(list);
    set({ models: list });
  },

  async updateModel(id, patch) {
    let list = get().models.map((m) =>
      m.id === id ? { ...m, ...patch, updatedAt: nowIso() } : m
    );
    // 如果设为默认，取消其他默认
    if (patch.isDefault) {
      list = list.map((m) => (m.id === id ? m : { ...m, isDefault: false }));
    }
    await saveModels(list);
    set({ models: list });
  },

  async removeModel(id) {
    // 先清理系统凭据中残留的 API Key（若存在 apiKeyRef）
    const model = get().models.find((m) => m.id === id);
    if (model?.apiKeyRef) {
      try {
        await deleteApiKey(model.apiKeyRef);
      } catch (e) {
        // 凭据删除失败不应阻塞模型删除流程，仅记录日志
        console.warn("[appStore] 删除模型时清理凭据失败", e);
      }
    }
    const list = get().models.filter((m) => m.id !== id);
    await saveModels(list);
    set({ models: list });
  },

  defaultModel() {
    return get().models.find((m) => m.isEnabled && m.isDefault) || get().models.find((m) => m.isEnabled) || null;
  },
});
