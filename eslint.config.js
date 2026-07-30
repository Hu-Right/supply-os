import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        CustomEvent: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "no-undef": "off", // TypeScript handles this
    },
  },
  {
    // TS/TSX 统一用 typescript-eslint 解析器（仅解析，不启用类型感知规则）
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    linterOptions: {
      // 存量代码内留有 exhaustive-deps 的逐行 disable 注释（规则暂关），不报 unused directive
      reportUnusedDisableDirectives: "off",
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // TS 类型检查已覆盖 no-undef/no-unused-vars 职责（类型导入会被误报）
      "no-unused-vars": "off",
      "no-undef": "off",
      // Hooks 规则：rules-of-hooks 零违例直接锁 error；exhaustive-deps 存量违例待清理，暂关
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/features/*/*"],
          message: "跨 feature 只能引用对方 index.ts（@/features/<name>）；深路径视为私有实现。",
        }],
      }],
    },
  },
  {
    files: ["src/core/**/*.{ts,tsx}", "src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/features/*"],
          message: "core/shared 不得依赖 features 层。",
        }],
      }],
    },
  },
  {
    ignores: [
      "node_modules/",
      "dist/",
      "coverage/",
      "*.config.js",
      "*.config.ts",
    ],
  },
];
