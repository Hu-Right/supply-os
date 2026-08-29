/**
 * ESLint 扁平配置（ESLint 10 + typescript-eslint）
 *
 * ESLint 10 目录模式修复说明：
 * 旧配置仅有 js.configs.recommended（默认只匹配 **\/*.js），src/ 下全部为
 * .ts/.tsx，导致 `eslint src/` 报 "all files matching src/ are ignored"。
 * 现引入 typescript-eslint 提供 TS 解析与规则，覆盖 .ts/.tsx/.mts/.cts。
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  // 全局忽略（扁平配置中 ignores 独立对象即为 global ignores）
  {
    ignores: [
      "node_modules/",
      "dist/",
      "coverage/",
      "bin/",
      "logs/",
      "dumps/",
      "*.config.js",
      "*.config.ts",
    ],
  },
  // JS 基础规则
  js.configs.recommended,
  // TypeScript 解析 + 推荐规则（无需 projectService，纯语法级检查，速度快）
  ...tseslint.configs.recommended,
  // React Hooks 规则（rules-of-hooks / exhaustive-deps）：
  // 代码中大量 eslint-disable react-hooks/exhaustive-deps 注释依赖此插件存在，
  // 缺失时这些注释会报 "Definition for rule was not found" 错误
  reactHooks.configs.flat.recommended,
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
        localStorage: "readonly",
        navigator: "readonly",
        process: "readonly",
        Buffer: "readonly",
        IntersectionObserver: "readonly",
        FormData: "readonly",
        URLSearchParams: "readonly",
      },
    },
    rules: {
      // 由 @typescript-eslint 版本接管（识别类型感知场景下的合法未使用参数）
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      // 存量代码大量使用 any（tsconfig 已注释约束新增代码），ESLint 侧不阻断，渐进收敛
      "@typescript-eslint/no-explicit-any": "off",
      // 空 catch 在本项目中广泛用于静默降级（网络/缓存类操作），不阻断
      "no-empty": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-console": "off",
      "no-undef": "off", // TypeScript 处理
      // ── react-hooks v7 新增的 React Compiler 类规则：与项目既有模式冲突，关闭 ──
      // 1) set-state-in-effect：初始化 effect 中恢复持久化状态是本项目的标准模式
      //    （AuthContext localStorage 恢复、级联选择重置等）
      // 2) refs：render 阶段读写 ref.current 是项目通用的 latest-value 模式
      //    （callbackRef/firstLoadDoneRef 等），且 LoadingOverlay 等组件为
      //    intentional 设计禁止重构
      // 3) purity：缓存 TTL 判断等受控的非纯调用为有意为之
      // 保留 rules-of-hooks（error）与 exhaustive-deps（warn）两个核心规则
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/unsupported-syntax": "off",
      "react-hooks/error-boundary": "off",
      "react-hooks/component-hook-factory": "off",
      "react-hooks/static-components": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/use-memo-with-deps": "off",
      "react-hooks/refs-in-render": "off",
    },
  },
  // ── src/lib/ 后端代码：禁用 React 专属规则，启用 Node.js 全局 ──
  // #ARCH-001: 消除后端代码 ESLint 监管盲区
  {
    files: ["src/lib/**/*.ts"],
    languageOptions: {
      globals: {
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        crypto: "readonly",
        globalThis: "readonly",
      },
    },
    rules: {
      // React Hooks 规则对纯后端代码不适用
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
      // 后端代码中 any 渐进收敛
      "@typescript-eslint/no-explicit-any": "warn",
      // 存量正则中的冗余转义（如 \.）不影响功能，降级为 warn 渐进修复
      "no-useless-escape": "warn",
    },
  },
);
