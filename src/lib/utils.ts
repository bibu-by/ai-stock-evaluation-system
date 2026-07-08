import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合并 Tailwind 类名（shadcn/ui 标准工具）
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 生成唯一 ID
 */
export function uid(prefix = ""): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}_${t}${r}` : `${t}${r}`;
}

/**
 * 当前 ISO 时间
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 防抖
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/**
 * 简单 sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 浅克隆 JSON
 */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * 是否在 Tauri 桌面环境
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}
