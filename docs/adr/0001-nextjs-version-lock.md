# ADR-0001: Next.js 版本锁定（~15.2.0）

- **状态**：已接受
- **日期**：2026-08-26
- **阶段**：Phase 0.1

## 决策

锁定 **Next.js 15.x**，具体版本约束 `"next": "~15.2.0"`。

## 背景

项目从 Vite 6 + React 19 SPA 迁移到 Next.js App Router。需要确定主版本以避免 API 破坏性变更带来的返工。

Next 15 与 16 的关键差异：

| 维度 | Next 15.x | Next 16.x |
|------|-----------|-----------|
| 中间件文件 | `middleware.ts` | `proxy.ts` |
| serverActions 配置 | next.config 内 | 提级到顶层 |
| 默认打包器 | Webpack（可选 Turbopack） | Turbopack 默认 |

## 关键约束

Next 15/16 的 `params` / `searchParams` **均为 Promise**，必须 `await`：

```typescript
// page.tsx — 动态段参数必须 await
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}

// generateMetadata — searchParams 也是 Promise
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
}
```

## 理由

1. 15.x 是当前稳定 LTS 线，社区生态成熟，`middleware.ts` 语法与迁移计划一致。
2. 16.x 的 `proxy.ts` 改名和 Turbopack 默认引入额外不确定因素。
3. `~15.2.0` 允许 patch 级自动升级，同时拒绝 minor 跳变。

## 后续升级路径

Phase 6 完成后可评估 16.x 升级，届时 `middleware.ts` → `proxy.ts` 为机械重命名。
