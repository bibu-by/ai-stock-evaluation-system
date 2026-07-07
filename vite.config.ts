import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Tauri 期望的前端端口
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/target/**", "**/.vs/**", "**/node_modules/**"],
    },
  },
  // Tauri 构建期望的产物目录
  build: {
    target: "es2021",
    outDir: "dist",
    emptyOutDir: true,
  },
  // 确保环境变量前缀
  envPrefix: ["VITE_", "TAURI_"],
  // 单元测试配置（vitest）
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
