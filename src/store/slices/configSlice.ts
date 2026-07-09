// 配置域 Slice
// 管理 config / theme 及其设置/主题切换。
// initApp 中的配置加载逻辑统筹在 appStore.ts（跨域组合各 slice 初始化），本 slice 仅负责配置本身的读写。

import type { StateCreator } from "zustand";
import type { AppState, ConfigSlice } from "../types";
import { saveConfig } from "@/services/localStore";

export const createConfigSlice: StateCreator<AppState, [], [], ConfigSlice> = (set, get) => ({
  config: null,
  theme: "dark",

  async setConfig(patch) {
    const old = get().config;
    if (!old) return;
    const next = { ...old, ...patch };
    await saveConfig(next);
    set({ config: next });
    if (patch.theme) {
      const theme = patch.theme === "light" ? "light" : "dark";
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", theme === "dark");
      }
      set({ theme });
    }
  },

  async toggleTheme() {
    const cur = get().theme;
    const next = cur === "dark" ? "light" : "dark";
    await get().setConfig({ theme: next });
  },
});
