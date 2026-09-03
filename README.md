# Supply OS

全球采购情报与供应商协作平台（标讯检索 · AI 撮合 · 会员付费 · 培训服务）。

> 架构与分层约定见 [ARCHITECTURE.md](./ARCHITECTURE.md)；架构决策记录见 [docs/adr/](./docs/adr/)。

## 技术栈

Next.js 16 (App Router, standalone) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · MySQL (mysql2) · Meilisearch · Vitest + Playwright

## 快速开始

```bash
npm install
npm run dev          # http://localhost:3000
```

环境变量参考 `.env.example`（MySQL / Meilisearch / 支付 / 翻译通道等）。

## 常用命令

```bash
npm run typecheck        # tsc --noEmit
npm run lint             # 编码检查 + eslint
npm run test             # Vitest 单测
npm run test:unit        # 单测 + 覆盖率（coverage/unit）
npm run test:ci          # 单测门禁(90%) + 集成门禁(80%)
npm run test:e2e         # Playwright 关键旅程
npm run seed:test-db     # 测试库建库 + 迁移 + 种子数据
npm run build            # 生产构建（standalone）
```

## 目录结构

| 目录 | 职责 |
|---|---|
| `src/app` | 路由（服务端壳 + page-client 客户端接管）与 API 路由 |
| `src/features` | 特性模块（auth/crm/learning/membership/payment/procurement/services/showroom/supplier/training） |
| `src/shared` | 跨特性 UI 组件与工具 |
| `src/core` | 客户端框架（http/auth/i18n/events/perf） |
| `src/lib` | 服务端树（db/repos/services/payment/middleware） |
| `tests/` | 集成测试与 E2E |
| `docs/` | 合规文档、评审报告、ADR |

## 协作约定

- 依赖方向红线、错误反馈约定、安全约定见 [ARCHITECTURE.md](./ARCHITECTURE.md)。
- 测试：改钱路（支付/解锁/退款）必须带测试；新文件记得纳入 `vitest.config.ts` 的 coverage 白名单。
- 提交前本地执行 `npm run pre-push`（编码/类型/lint/测试/构建）。
