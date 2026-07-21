---
kind: build_system
name: Vite + Express 单进程构建与部署
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - vite.config.ts
    - server.ts
---

## 构建系统概览
本项目采用「Vite 前端 + Express 后端」的单仓一体化架构，通过 Node.js 单进程同时托管静态资源与 API。开发阶段使用 tsx 热重载运行 server.ts，生产阶段由 Vite 打包前端、esbuild 将 server.ts 编译为 CJS 产物，最终统一由 `node dist/server.cjs` 启动。

## 核心工具链
- **前端构建**: Vite 6 + @vitejs/plugin-react + Tailwind CSS v4（@tailwindcss/vite），输出到 `dist/`。
- **后端打包**: esbuild 0.25，将 TypeScript 源文件 `server.ts` 以 Node 平台、CJS 格式、外部依赖不内联的方式打包为 `dist/server.cjs`，并生成 sourcemap。
- **开发运行**: tsx 直接执行 `server.ts`，无需预编译；Vite HMR 默认开启，可通过 `DISABLE_HMR=true` 关闭（AI Studio 场景）。
- **类型检查**: `tsc --noEmit` 作为 lint 脚本。
- **运行时**: Node.js ESM 工程（`"type": "module"`），Express 4 提供 HTTP 服务，mysql2/promise 连接 MySQL crm 数据库。

## 关键脚本（package.json scripts）
| 命令 | 作用 |
|---|---|
| `npm run dev` | tsx 热重载运行 server.ts（含 Vite HMR） |
| `npm run build` | Vite 构建前端 + esbuild 打包后端为 `dist/server.cjs` |
| `npm run preview` | Vite 预览已构建的前端产物 |
| `npm run start` | 生产环境入口：`node dist/server.cjs` |
| `npm run clean` | 删除 `dist/` 和 `server.js` |
| `npm run lint` | TypeScript 类型检查（无输出） |

## 构建流程细节
1. **Vite 构建**：读取 `vite.config.ts`，启用 react 与 tailwindcss 插件，配置 `@` 别名指向 `src/`，允许 `osneosmart.com` 作为外部 host 访问开发服务器。
2. **esbuild 打包**：对 `server.ts` 进行单文件打包，`--packages=external` 保留 node_modules 引用，便于在容器或宿主机复用依赖。
3. **启动阶段自举**：`startServer()` 中动态 import mysql2/promise，创建连接池后调用 `ensureProcurementSchema` 自动建表/补列/建索引，并回填 user_id、UNSPSC bridge 等数据。
4. **支付配置热加载**：启动时从 `crm_payment_provider_configs` 表拉取支付宝/微信支付配置覆盖环境变量，支持 `PAYMENT_MODE=live` 切换真实/模拟模式。

## 部署约定
- 产物目录：`dist/`（Vite 静态资源 + `server.cjs`）。
- 运行方式：`NODE_ENV=production node dist/server.cjs`，通过环境变量注入数据库、支付密钥等敏感信息。
- 无 Dockerfile / Makefile / CI 流水线，当前部署依赖手动执行 npm scripts 或在宿主环境直接运行。

## 开发者应遵循的规则
- 新增后端逻辑一律写入 `server.ts`，保持单进程 Express 应用形态。
- 数据库结构变更通过 `ensureColumn` / `ensureIndex` 等幂等函数在启动时自动迁移，禁止手写 DDL 脚本。
- 环境变量命名需与 `getPaymentRuntimeConfig` 中的校验列表保持一致，新增支付 provider 时需同步更新该函数。
- 前端代码位于 `src/`，通过 `@/xxx` 别名引用，避免相对路径穿越。
- 如需引入新的第三方包，优先放入 `dependencies`；仅用于构建/类型的包放入 `devDependencies`。