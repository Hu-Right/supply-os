---
kind: dependency_management
name: NPM 依赖管理（单仓 React+Express 应用）
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
---

## 1. 使用的系统/方法
- **包管理器**：npm（从 README 和脚本中可确认使用 `npm install`、`npm run dev` 等命令）
- **锁定文件**：`package-lock.json`（lockfileVersion: 3），用于固定所有依赖的精确版本，保证构建可重现
- **仓库类型**：私有项目（`"private": true`），不发布到 npm registry
- **注册源**：默认使用官方 npm registry（`https://registry.npmjs.org/`），未发现 `.npmrc`、私有镜像或 Verdaccio 配置
- **无 vendoring**：未使用 `vendor/`、`pnpm-workspace.yaml`、`yarn.lock` 或 `bun.lock` 等策略，依赖通过 `node_modules` 安装

## 2. 关键文件与包
- **依赖声明中心**：`package.json`（顶层单仓，前后端共享同一份依赖）
- **锁定文件**：`package-lock.json`（4486 行，包含完整依赖树）
- **运行时依赖**：`express`、`mysql2`、`react`、`react-dom`、`react-router-dom`、`@google/genai`、`motion`、`lucide-react`、`dotenv`
- **开发依赖**：`vite`、`esbuild`、`tsx`、`typescript`、`tailwindcss`、`@types/*`、`autoprefixer`
- **构建产物**：`dist/server.cjs`（由 esbuild 打包后端）、`dist/`（Vite 前端产物）

## 3. 架构与约定
- **单仓统一依赖**：前后端共用一个 `package.json`，Express 后端与 React 前端共享依赖，避免多包管理复杂度
- **TypeScript + Vite 构建链**：开发阶段用 `tsx` 直接运行 TypeScript 后端；生产构建先用 Vite 打包前端，再用 esbuild 将 `server.ts` 打包为 CJS 单文件
- **ESM 模块**：`"type": "module"` 启用 ESM，但生产后端以 CJS 输出（`--format=cjs`），兼容 Node.js 部署环境
- **依赖版本策略**：生产依赖使用 `^` 前缀（如 `"express": "^4.21.2"`），允许小版本升级；开发依赖中 `typescript` 使用 `~5.8.2` 更严格的补丁级锁定
- **无工作区/子包**：仓库根目录即唯一包，不存在 monorepo 结构

## 4. 开发者应遵循的规则
- **新增依赖时**：始终通过 `npm install <pkg>` 添加，确保 `package.json` 与 `package-lock.json` 同步提交
- **不要手动编辑 `package-lock.json`**：如需调整版本，修改 `package.json` 后重新 `npm install` 生成锁文件
- **区分依赖类别**：仅运行时需要的库放入 `dependencies`，构建/类型/测试工具放入 `devDependencies`（当前已按此规范组织）
- **保持锁文件在版本控制中**：`package-lock.json` 必须随代码一起提交，以保证 CI/CD 环境与其他开发者获得一致的依赖树
- **谨慎升级大版本**：React 19、Vite 6、Express 4 均为较新版本，升级时需关注 breaking changes 并充分测试
- **环境变量注入**：使用 `dotenv` 加载 `.env` 文件，敏感配置不应硬编码进依赖或源码