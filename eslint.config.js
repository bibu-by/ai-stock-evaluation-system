// ESLint 平面配置（ESLint 9）
// 本轮目标：渐进式启用，规则以 warn 为主，不破坏构建，不一次性重排格式。
// 重点捕获：未使用变量、react-hooks 依赖、any 滥用、常量条件等。

import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
    },
    rules: {
      // ====== TypeScript ======
      // warn 而非 error，避免立即破坏开发体验
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": "warn",

      // ====== React Hooks ======
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // ====== 通用 ======
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-constant-condition": "warn",
      "prefer-const": "warn",
      "no-var": "error",
    },
    settings: {
      react: { version: "detect" },
    },
  },
  {
    // 测试文件放宽 console 限制
    files: ["src/**/*.test.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // 忽略目录
    ignores: ["dist/**", "src-tauri/**", "node_modules/**", "src/mock/**"],
  },
];
