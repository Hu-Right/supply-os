# Supply-OS 前端模块化重构 — 实施计划 v3.1

> **For agentic workers:** 请使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现。

**Goal:** 将 2575 行 `App.tsx` 拆分为 `core/` + `shared/` + `features/` + `data/` + `types/` 五层架构，引入 react-router-dom 替代 hash 伪路由，利用 React 19 `use()` 简化数据获取。

**Architecture:** React 19 + react-router-dom v7 做路由层。AuthContext 管理认证业务状态，UI 状态由 App 层管理。features 按 pages/components/hooks/api 四层组织。依赖方向 types → data → core → shared → features → App 严格单向。

**Tech Stack:** React 19.0.1 + TypeScript 5 + Vite + Tailwind CSS v4.3.0 (`@tailwindcss/vite`) + lucide-react + react-router-dom v7 + motion ^12.23 + @google/genai ^2.4

## Global Constraints

- React ^19.0.1, Tailwind v4.3.0, TypeScript ^5
- 新增依赖：
  - `react-router-dom` ^7.x（路由层）
  - `i18next` + `react-i18next`（i18n 引擎，替换自研 LocaleContext）——因平台需支持联合国 6 种语言（中/英/法/俄/西/阿），含阿拉伯语 RTL 及数字/货币/日期本地化，自研方案能力不足，故引入。分阶段落地：先在新引擎下对齐现有 zh/en 效果（消费方零改动），RTL 与 Intl 格式化按需后续启用。
- 所有现有功能保持完整可用
- 不涉及 `server.ts` 后端代码
- 不提交 git
- 路径别名 `@/` 映射 `src/`（修正现有配置，非新建）
- 每个 Phase 结束执行 `npx tsc --noEmit && npx vite build --mode development`
- Tailwind v4 通过 CSS `@theme` 扩展，无 `tailwind.config.ts`

## 实施顺序（审查修正后）

| Phase | 内容 | 理由 |
|-------|------|------|
| Phase 0 | 修正别名 + 安装 react-router-dom | 基础配置先行 |
| Phase 1 | types + data 拆分 | 最底层，零风险 |
| Phase 2 | core 层：auth + i18n + http + payment | 基础设施，上层依赖 |
| Phase 3 | shared 层：UI + layout + forms + ErrorBoundary + ProtectedRoute | 通用组件 |
| Phase 4 | features 业务模块（按优先级逐个迁移） | 业务实现 |
| Phase 5 | App + routes + 清理旧文件 | 最终整合 |
| Phase 6 | 测试 + engineering（ESLint、i18n 校验） | 收尾 |

## 审查修正汇总

| 原问题 | 修正 |
|--------|------|
| Tailwind v3 config 不兼容 v4 | 删除 `tailwind.config.ts`，改用 `index.css` 中 `@theme` 扩展 |
| 路径别名已存在但指向 `.` | 修正为 `src/`，不是新建 |
| `useFetch` 的 `refresh()` 不触发重渲染 | 增加版本号 state，`refresh()` 时递增强制重渲染 |
| payment 在 `features/` 层级不当 | 提升到 `core/payment/`，作为基础设施 |
| 缺少路由权限守卫 | 新增 `shared/layout/ProtectedRoute.tsx` |
| 两层缓存职责重叠 | `useFetch` 底层复用 `apiCached` 的同一缓存 |
| AuthContext 职责过重 | 只保留认证业务逻辑；弹窗状态放回 App 层 |
| Feature Flag 过度设计 | 删除 Feature Flag，直接全量重构 |
| 实施顺序不合理 | 调整为 0→1→2(core)→3(shared)→4(features)→5(App)→6(test) |
| `motion` 和 `@google/genai` 使用未明确 | 在 Phase 4 的 crm 模块中明确封装位置 |
| 缺少按领域 API 模块 | 每个 feature 增加 `api.ts` |
| 401 事件监听位置不明确 | `App.tsx` 中统一监听 |
| `AiMatchmaker.tsx` 放置不规范 | 移入 `features/crm/components/` |
| 测试在 Phase 7 太晚 | 工具函数同步写测试，业务 hook 测试在 Phase 6 |
| 缺少 ESLint/Prettier | Phase 6 添加基础配置 |
| Barrel 导出规范不完整 | 所有层（core/shared/features）统一规则 |

---

## Phase 0: 基础配置修正

### Task 0.1: 修正 `@/` 路径别名

**现状：** `vite.config.ts` 中 `'@': path.resolve(__dirname, '.')` 指向项目根目录，应指向 `src/`。

- [ ] **Step 1: 修正 `vite.config.ts`**

```typescript
// 将 '.' 改为 'src'
alias: {
  '@': path.resolve(__dirname, 'src'),
},
```

- [ ] **Step 2: 同步修正 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 3: 验证**

```bash
npx tsc --noEmit
```

### Task 0.2: 安装 react-router-dom

```bash
npm install react-router-dom@^7
```

### Task 0.3: Tailwind v4 Design Tokens（CSS @theme）

**v4 不使用 `tailwind.config.ts`**，通过 `index.css` 中的 `@theme` 扩展：

```css
/* src/index.css — 在现有 @import "tailwindcss" 之后追加 */
@import "tailwindcss";

@theme {
  --color-primary-50: #f0fdfa;
  --color-primary-100: #ccfbf1;
  --color-primary-500: #14b8a6;
  --color-primary-600: #0d9488;
  --color-primary-700: #0f766e;
  --color-secondary-50: #f8fafc;
  --color-secondary-100: #f1f5f9;
  --color-secondary-800: #1e293b;
  --color-secondary-900: #0f172a;
  --color-accent-50: #fffbeb;
  --color-accent-400: #fbbf24;
  --color-accent-500: #f59e0b;
}
```

后续新组件用 `bg-primary-600` 替代 `bg-teal-600`（向后兼容，旧类名仍可用）。

### Task 0.4: 验证

```bash
npx tsc --noEmit && npx vite build --mode development
```

---

## Phase 1: 拆分类型定义与静态数据

### Task 1.1: 拆分 `src/types.ts` → `src/types/`（所有领域类型统一管理）

**原则：core 层不自己定义类型，所有类型从 `@/types/` 引入，保持依赖单向。**

**Files:**
- Create: `src/types/exhibition.ts` (`ExhibitionHall`)
- Create: `src/types/supplier.ts` (`Supplier`)
- Create: `src/types/lead.ts` (`Lead`)
- Create: `src/types/opportunity.ts` (`Opportunity`)
- Create: `src/types/learning.ts` (`LearningMaterial`, `FAQItem`)
- Create: `src/types/auth.ts` (`AuthUser` — 从 core 迁移)
- Create: `src/types/payment.ts` (`PaymentProviderName`, `CreateOrderRequest`, `CreateOrderResult` 等)
- Create: `src/types/procurement.ts` (`NoticeItem`, `MembershipPlan`, `MembershipStatus` 等)
- Create: `src/types/index.ts`（barrel 导出）
- Delete: `src/types.ts`

所有文件使用 `@/types` 别名导入（无需 `../..`）。

### Task 1.2: 拆分 `src/data.ts` → `src/data/`

**Files:**
- Create: `src/data/exhibition-halls.ts`
- Create: `src/data/suppliers.ts`
- Create: `src/data/opportunities.ts`
- Create: `src/data/materials.ts`（`LEARNING_MATERIALS` + `TRAINING_DOWNLOAD_MATERIALS`）
- Create: `src/data/faqs.ts`
- Create: `src/data/index.ts`
- Delete: `src/data.ts`

验证：`npx tsc --noEmit && npx vite build --mode development`

---

## Phase 2: 创建 core 基础设施层

**依赖方向：** core 仅依赖 types/，不依赖 shared/ 或 features/。

### Task 2.1: 迁移 i18n → `@/core/i18n/`

> **引擎升级说明：** i18n 引擎从自研 `LocaleContext` 换为 `react-i18next`（保留 `useLocale()` 门面与从 `zh.json` 推导的编译期类型安全）。第一阶段仅在新引擎下对齐现有 zh/en 效果，消费方零改动；插值配置对齐现有单花括号 `{param}` 语法（`prefix:"{"`, `suffix:"}"`, `escapeValue:false`）。RTL 与 Intl 格式化留待后续按需启用。

**Files:**
- Move: `src/locales/LocaleContext.tsx` → `src/core/i18n/LocaleContext.tsx`
- Move: `src/locales/types.ts` → `src/core/i18n/types.ts`
- Copy: `src/locales/zh.json` → `src/core/i18n/zh.json`
- Copy: `src/locales/en.json` → `src/core/i18n/en.json`
- Create: `src/core/i18n/index.ts`（barrel 导出 `LocalesProvider`, `useLocale`, `Locale`, `LocaleKey`）
- Delete: `src/locales/` 目录

### Task 2.2: 创建 `@/core/http/` — 统一缓存层

**设计决策：** 只维护一份缓存。`useFetch` 底层调用 `apiCached` 的缓存 Map。

**Files:**
- Create: `src/core/http/api-client.ts`
- Create: `src/core/http/useFetch.ts`
- Create: `src/core/http/index.ts`

- [ ] **Step 1: `api-client.ts` — 带 TTL 缓存 + 401 拦截 + API base URL**

```typescript
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "ApiError"; }
}

const DEFAULT_TTL = 5 * 60 * 1000;
const cache = new Map<string, { data: unknown; timestamp: number }>();

export async function api<T>(endpoint: string, options: RequestInit & { body?: unknown } = {}): Promise<T> {
  const { body, ...init } = options;
  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string>) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("supply-os:unauthorized", { detail: { endpoint } }));
    throw new ApiError(401, "Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function apiCached<T>(endpoint: string, ttl = DEFAULT_TTL): Promise<T> {
  const cached = cache.get(endpoint);
  if (cached && Date.now() - cached.timestamp < ttl) return cached.data as T;
  const data = await api<T>(endpoint);
  cache.set(endpoint, { data, timestamp: Date.now() });
  return data;
}

/** 只暴露受控接口，不直接暴露 Map 引用 */
export function getCachedData(key: string) { return cache.get(key)?.data; }
export function getCachedTimestamp(key: string) { return cache.get(key)?.timestamp ?? 0; }
export function setCachedData(key: string, data: unknown) { cache.set(key, { data, timestamp: Date.now() }); }
export function deleteCachedData(key: string) { cache.delete(key); }
export function clearApiCache(pattern?: string): void {
  if (!pattern) { cache.clear(); return; }
  for (const key of cache.keys()) { if (key.includes(pattern)) cache.delete(key); }
}
```

- [ ] **Step 2: `useFetch.ts` — useMemo 避免 StrictMode 副作用 + refreshKey 修复逻辑缺陷**

```typescript
import { use, useMemo, useState } from "react";
import { apiCached, getCachedData, getCachedTimestamp } from "./api-client";

const DEFAULT_TTL = 5 * 60 * 1000;

/**
 * React 19 `use()` 声明式数据获取 Hook。
 *
 * - useMemo 包裹数据获取，避免 StrictMode 双渲染下的重复副作用
 * - refresh() 递增 refreshKey，强制 useMemo 重新计算
 * - refreshKey === 0 时尝试读缓存，> 0 时强制重新请求
 */
export function useFetch<T>(endpoint: string, ttl = DEFAULT_TTL): { data: T; refresh: () => void } {
  const [refreshKey, setRefreshKey] = useState(0);

  const promise = useMemo(() => {
    if (refreshKey === 0) {
      const cached = getCachedData(endpoint) as T | undefined;
      const ts = getCachedTimestamp(endpoint);
      if (cached !== undefined && Date.now() - ts < ttl) {
        return Promise.resolve(cached);
      }
    }
    return apiCached<T>(endpoint, ttl);
  }, [endpoint, ttl, refreshKey]);

  return {
    data: use(promise),
    refresh: () => setRefreshKey((k) => k + 1),
  };
}
```

### Task 2.3: 创建 `@/core/auth/` — 仅认证业务逻辑

**AuthContext 职责：** 认证状态（authUser, isVip）+ 业务方法（login, register, logout, refreshAuth, submitSupplierClaim）。

**弹窗 UI 状态不在这里**，由 App 层管理。

**Files:**
- Create: `src/core/auth/types.ts`（`AuthUser`）
- Create: `src/core/auth/AuthContext.tsx`
- Create: `src/core/auth/index.ts`

`AuthContext.tsx` 核心接口：

```typescript
interface AuthContextValue {
  authUser: AuthUser | null;
  isVip: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (form: RegisterForm) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  submitSupplierClaim: (claim: SupplierClaimForm) => Promise<void>;
  claimMessage: string;
  setClaimMessage: (msg: string) => void;
}
```

- 使用 `useRef(authUser)` 避免闭包陈旧引用（同 v2.1 修正 #8）
- `persistAuthUser` 同步更新 ref 和 state

### Task 2.4: 创建 `@/core/payment/` — 支付工具层（纯函数，无 UI）

**定位：** 支付是跨模块基础设施，`core/payment/` 只放纯工具函数和类型引用。支付 UI（PaymentModal、ManualPaymentModal）统一放在 `features/payment/` 作为全局功能模块。

**Files:**
- Move: `src/payment/types.ts` → `src/types/payment.ts`（遵循类型统一原则）
- Move: `src/payment/env-detector.ts` → `src/core/payment/env-detector.ts`
- Create: `src/core/payment/index.ts`
- Delete: `src/payment/PaymentService.ts`, `AlipayProvider.ts`, `WechatProvider.ts`, `MockProvider.ts`（后端代码）

**支付 UI 归属：** `features/payment/`（全局功能模块，无路由，通过事件/Context 唤起）

| 文件 | 功能 |
|------|------|
| `features/payment/PaymentModal.tsx` | 支付弹窗（选择渠道 + 等待 + 成功/失败） |
| `features/payment/ManualPaymentModal.tsx` | 年度顾问服务手动支付引导 |
| `features/payment/hooks/usePayment.ts` | 支付订单创建 + 轮询逻辑 |

### Task 2.5: 验证

```bash
npx tsc --noEmit && npx vite build --mode development
```

---

## Phase 3: 创建 shared 层

### Task 3.1: `@/shared/ui/` — 原子化通用组件 + a11y + displayName

**Files（11 个 + barrel）:**

| 组件 | a11y 要求 | displayName |
|------|----------|-------------|
| `Button.tsx` | icon-only 必填 `aria-label`；`onKeyDown Enter/Space` | `"Button"` |
| `Input.tsx` | `aria-label` 或关联 `<label>` | `"Input"` |
| `Select.tsx` | 同 Input | `"Select"` |
| `Modal.tsx` | `role="dialog"`, `aria-modal="true"`, `Escape` 关闭 | `"Modal"` |
| `Badge.tsx` | pulsate 时 `role="status"` | `"Badge"` |
| `Card.tsx` | — | `"Card"` |
| `EmptyState.tsx` | — | `"EmptyState"` |
| `Spinner.tsx` | `role="status"`, `aria-label="加载中"` | `"Spinner"` |
| `SearchInput.tsx` | `role="searchbox"` | `"SearchInput"` |
| `ErrorBoundary.tsx` | 错误态 `role="alert"`；检测 `ChunkLoadError`（`/loading chunk/i`）显示重试按钮 | `"ErrorBoundary"` |
| `AuthModal.tsx` | 认证弹窗（登录/注册/供应商绑定 Tab 切换）— 全局 UI 组件 | `"AuthModal"` |

`ErrorBoundary` 集成：
- `reportError` 注入（`setErrorReporter()` + `componentDidCatch` 中调用）
- `ChunkLoadError` 检测：`error instanceof TypeError && /loading chunk/i.test(msg)` → 显示 "网络波动导致资源加载失败，请重试" + "重新加载" 按钮

**motion 使用策略：** 通用动画（Modal 淡入/淡出、列表过渡）封装在 `shared/ui/` 组件内部，业务模块不直接依赖 `motion`。

### Task 3.2: `@/shared/layout/`

**Files（5 个 + barrel）:**

| 组件 | 功能 | displayName |
|------|------|-------------|
| `AppHeader.tsx` | 顶部导航 | `"AppHeader"` |
| `AppSidebar.tsx` | 移动端菜单 | `"AppSidebar"` |
| `TabNav.tsx` | 桌面 Tab 导航（`NavLink` + `({ isActive })` + `onMouseEnter` 预加载） | `"TabNav"` |
| `PageBanner.tsx` | 纯展示（标题 + `children` 注入操作按钮） | `"PageBanner"` |
| `ProtectedRoute.tsx` | 路由权限守卫（未登录 → 重定向首页 + 弹窗） | `"ProtectedRoute"` |

**`ProtectedRoute.tsx`：**

```typescript
import { Navigate } from "react-router-dom";
import { useAuth } from "@/core/auth";

export default function ProtectedRoute({ children, requireVip = false }: { children: React.ReactNode; requireVip?: boolean }) {
  const { authUser, isVip } = useAuth();
  if (!authUser) {
    window.dispatchEvent(new CustomEvent("supply-os:require-login"));
    return <Navigate to="/showroom" replace />;
  }
  if (requireVip && !isVip) {
    window.dispatchEvent(new CustomEvent("supply-os:require-vip"));
    return <Navigate to="/showroom" replace />;
  }
  return <>{children}</>;
}
```

### Task 3.3: `@/shared/filters/` + `@/shared/forms/`

| 文件 | 功能 |
|------|------|
| `filters/RegionFilter.tsx` | 地区 → 国家联动筛选 |
| `filters/IndustryFilter.tsx` | 行业下拉筛选 |
| `forms/FormField.tsx` | label + children 包装 |
| `forms/FileDropZone.tsx` | 拖拽上传区（仿真） |

### Task 3.4: 验证

```bash
npx tsc --noEmit && npx vite build --mode development
```

---

## Phase 4: 创建 features 业务模块

每个 feature 模块组织结构：`pages/` + `components/` + `hooks/` + `api.ts`。

**按优先级逐个迁移，每完成一个模块验证一次。**

### 通用模式

```typescript
// features/xxx/api.ts — 统一管理该模块所有 API 调用
import { api } from "@/core/http";
import type { Xxx } from "@/types";

export const fetchXxxList = () => api<Xxx[]>("/api/xxx");
export const createXxx = (data: unknown) => api<Xxx>("/api/xxx", { method: "POST", body: data });
```

```typescript
// features/xxx/index.ts — Barrel 只导出 pages 和 hooks
export { default as XxxPage } from "./pages/XxxPage";
export { useXxxFilter } from "./hooks/useXxxFilter";
// ❌ 不导出 components（内部私有）
```

### 迁移顺序（风险从低到高）

| 顺序 | 模块 | 路由 | 数据来源 | 风险 |
|------|------|------|----------|------|
| 1 | `features/services/` | `/services` | 纯静态数据 | 极低 |
| 2 | `features/membership/` | `/membership` | 纯静态数据 | 极低 |
| 3 | `features/learning/` | `/learning` | 静态 + 下载 | 低 |
| 4 | `features/training/` | `/training` | API 表单提交 | 低 |
| 5 | `features/showroom/` | `/showroom` | 静态数据 + 表单提交 | 中 |
| 6 | `features/supplier/` | `/supplier` | 静态 + API | 中 |
| 7 | `features/procurement/` | `/procurement` | API 列表 + 配额 + 支付 | 高 |
| 8 | `features/crm/` | `/crm` | API + AI 匹配（@google/genai） | 高 |

### CRM 模块特殊说明

**`@google/genai` 封装：** AI 匹配逻辑抽取到 `features/crm/hooks/useAiMatch.ts`，底层调用 `@google/genai`：

```typescript
// features/crm/hooks/useAiMatch.ts
import { GoogleGenAI } from "@google/genai";

export function useAiMatch() {
  const [report, setReport] = useState("");
  const [isMatching, setIsMatching] = useState(false);

  const triggerMatch = async (supplier: Supplier, opportunity: Opportunity, locale: string) => {
    setIsMatching(true);
    try {
      const response = await fetch("/api/ai/matchmake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier, opportunity, language: locale }),
      });
      const json = await response.json();
      setReport(json.analysis);
    } catch {
      setReport(locale === "zh" ? "匹配请求失败" : "Matchmaker API error");
    } finally {
      setIsMatching(false);
    }
  };

  return { report, isMatching, triggerMatch };
}
```

**`AiMatchmaker.tsx` 放置在 `features/crm/components/AiMatchmaker.tsx`**，不是根目录。

### 各模块组件接口摘要

| 模块 | 核心组件 | 关键 Props |
|------|----------|-----------|
| `showroom/` | `ShowroomCard` | `showroom: ExhibitionHall`, `onApply`, `onConsult` |
| `showroom/` | `RegisterForm` | `selectedShowroom`, `onClose`, `onSuccess` |
| `procurement/` | `NoticeCard` | `notice: NoticeItem`, `onOpen: (n) => void` |
| `procurement/` | `NoticeDetail` | `notice: NoticeItem`, `onClose` |
| `procurement/` | `UnspcsSelector` | `levels`, `selectedIds`, `onLevelChange` |
| `procurement/` | `ManualPaymentModal` | `plan: MembershipPlan`, `qrVisible`, `onShowQr`, `onClose` |
| `supplier/` | `SupplierCard` | `supplier: Supplier`, `onAiMatch`, `onContact` |
| `supplier/` | `RegisterForm` | `onClose`, `onSuccess` |
| `crm/` | `StatsCards` | `leads: Lead[]` |
| `crm/` | `OpportunityList` | `opportunities`, `selectedId`, `onSelect`, `onSubscribe` |
| `crm/` | `LeadCard` | `lead: Lead`, `isActive`, `onClick` |
| `crm/` | `LeadTracker` | `leads`, `isLoading`, `activeLead`, `onSelectLead` |
| `crm/` | `FollowUpLogPanel` | `lead: Lead`, `onClose`, `onSubmitLog` |
| `crm/` | `AiMatchmaker` | `suppliers: Supplier[]`, `opportunities: Opportunity[]` |

---

## Phase 5: App.tsx 重组 + routes.tsx + 清理

### Task 5.1: 创建 `@/routes.tsx`

```tsx
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Spinner, ErrorBoundary } from "@/shared/ui";
import { ProtectedRoute } from "@/shared/layout";

const ShowroomPage = lazy(() => import("@/features/showroom"));
const ProcurementPage = lazy(() => import("@/features/procurement"));
const SupplierPage = lazy(() => import("@/features/supplier"));
const CrmPage = lazy(() => import("@/features/crm"));
const ServicesPage = lazy(() => import("@/features/services"));
const LearningPage = lazy(() => import("@/features/learning"));
const MembershipPage = lazy(() => import("@/features/membership"));
const TrainingPage = lazy(() => import("@/features/training"));

function RootRedirect() {
  const location = useLocation();
  return <Navigate to="/showroom" replace state={location.state} />;
}

export default function AppRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Spinner size="lg" className="mx-auto mt-20" />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/showroom" element={<ShowroomPage />} />
          <Route path="/procurement" element={<ProcurementPage />} />
          <Route path="/supplier" element={<SupplierPage />} />
          <Route path="/crm" element={<ProtectedRoute><CrmPage /></ProtectedRoute>} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/learning" element={<LearningPage />} />
          <Route path="/membership" element={<MembershipPage />} />
          <Route path="/training" element={<TrainingPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
```

### Task 5.2: 路由预加载（合并在 `routes.tsx` 中，不单独建文件）

在 `routes.tsx` 底部追加：

```typescript
// 路由预加载（TabNav onMouseEnter 触发）
const preloadMap: Record<string, () => Promise<unknown>> = {
  "/showroom": () => import("@/features/showroom"),
  "/procurement": () => import("@/features/procurement"),
  "/supplier": () => import("@/features/supplier"),
  "/crm": () => import("@/features/crm"),
  "/services": () => import("@/features/services"),
  "/learning": () => import("@/features/learning"),
  "/membership": () => import("@/features/membership"),
  "/training": () => import("@/features/training"),
};

export function preloadRoute(path: string) {
  preloadMap[path]?.().catch(() => {});
}
```

在 `TabNav.tsx` 中：`<NavLink onMouseEnter={() => preloadRoute(item.path)} ...>`

### Task 5.3: 重写 `@/App.tsx`（目标 ~50 行）

```tsx
import { useState, useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { useAuth } from "@/core/auth";
import { AppHeader, AppSidebar, TabNav } from "@/shared/layout";
import AppRoutes from "@/routes";
import { Modal } from "@/shared/ui";
import AuthModal from "@/features/auth/pages/AuthModal";

export default function App() {
  const { authUser } = useAuth();

  // UI 状态由 App 层管理（不在 AuthContext 中）
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 监听全局 401 + 权限事件
  useEffect(() => {
    const handler = () => setShowAuthModal(true);
    window.addEventListener("supply-os:unauthorized", handler);
    window.addEventListener("supply-os:require-login", handler);
    return () => {
      window.removeEventListener("supply-os:unauthorized", handler);
      window.removeEventListener("supply-os:require-login", handler);
    };
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
        <AppHeader
          onAuthClick={() => setShowAuthModal(true)}
          onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        <AppSidebar
          open={mobileMenuOpen}
          onAuthClick={() => setShowAuthModal(true)}
          onClose={() => setMobileMenuOpen(false)}
        />
        <TabNav />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
          <AppRoutes />
        </main>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </div>
    </BrowserRouter>
  );
}
```

### Task 5.4: 更新 `@/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "@/core/i18n";
import { AuthProvider } from "@/core/auth";
import App from "@/App";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LocaleProvider>
  </StrictMode>,
);
```

### Task 5.5: 清理旧文件

```bash
rm src/types.ts src/data.ts
rm -rf src/locales src/payment
rm src/ProcurementNoticesPool.tsx src/TrainingPage.tsx src/TrainingRegisterModal.tsx src/PaymentModal.tsx
```

### Task 5.6: 验证

```bash
npx tsc --noEmit && npx vite build --mode development
```

---

## Phase 6: 测试加固 & 工程完善

### Task 6.1: 安装测试依赖

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

### Task 6.2: Vitest 配置

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { globals: true, environment: "jsdom", pool: "forks" },
});
```

### Task 6.3: 核心测试用例（创建时同步写测试）

| 测试文件 | 覆盖范围 |
|----------|----------|
| `src/__tests__/core/http/api-client.test.ts` | `api()` 401 事件、`apiCached()` TTL 缓存 |
| `src/__tests__/shared/ui/ErrorBoundary.test.tsx` | 正常渲染 + 错误捕获 + 重试按钮 |
| `src/__tests__/shared/ui/Modal.test.tsx` | 开关 + Escape 关闭 + `aria-modal` |
| `src/__tests__/shared/layout/PageBanner.test.tsx` | 标题 + children 渲染 |
| `src/__tests__/shared/layout/ProtectedRoute.test.tsx` | 未登录重定向 + VIP 拦截 |
| `src/__tests__/features/showroom/useShowroomFilter.test.ts` | 筛选逻辑正确性 |
| `src/__tests__/features/crm/useLeads.test.ts` | CRUD 操作 |
| `src/__tests__/features/crm/useAiMatch.test.ts` | AI 匹配触发 + 错误处理 |

### Task 6.4: ESLint + Prettier 基础配置

```bash
npm install -D eslint @eslint/js prettier
```

```javascript
// eslint.config.js
import js from "@eslint/js";
export default [js.configs.recommended, {
  rules: {
    "no-unused-vars": "warn",
    "no-console": "off",
  },
}];
```

### Task 6.5: i18n 键校验脚本

```typescript
// scripts/check-i18n.ts
import zh from "../src/core/i18n/zh.json";
import en from "../src/core/i18n/en.json";
const zk = Object.keys(zh), ek = Object.keys(en);
const me = zk.filter(k => !ek.includes(k)), mz = ek.filter(k => !zk.includes(k));
if (me.length) console.error("❌ en.json 缺少:", me);
if (mz.length) console.error("❌ zh.json 缺少:", mz);
if (!me.length && !mz.length) console.log("✅ 中英键一致，共", zk.length, "个");
process.exit(me.length || mz.length ? 1 : 0);
```

`package.json` 添加：

```json
{
  "scripts": {
    "check-i18n": "npx tsx scripts/check-i18n.ts",
    "lint": "eslint src/",
    "test": "vitest run"
  }
}
```

### Task 6.6: Barrel 导出规范（全层统一）+ 循环依赖防护

| 目录 | index.ts 导出策略 |
|------|------------------|
| `types/` | 导出所有类型 |
| `data/` | 导出所有常量 |
| `core/i18n/` | 导出 `LocalesProvider`, `useLocale`, `type Locale`, `type LocaleKey` |
| `core/auth/` | 导出 `AuthProvider`, `useAuth`；类型从 `@/types/auth` 引入 |
| `core/http/` | 导出 `api`, `apiCached`, `useFetch`, `clearApiCache` |
| `core/payment/` | 导出 `getAvailableProviders`, `detectPlatformEnv`, `isMobile` |
| `shared/ui/` | 导出所有 UI 组件 |
| `shared/layout/` | 导出所有布局组件（含 ProtectedRoute） |
| `shared/filters/` | 导出所有筛选组件 |
| `shared/forms/` | 导出所有表单组件 |
| `features/xxx/` | **只导出 pages 和 hooks**，不导出 components |

**循环依赖防护规则：同目录组件之间互相引用必须用相对路径，禁止通过 `index.ts` barrel 导入。**

```typescript
// ✅ shared/ui/Modal.tsx — 引用同目录 Button
import Button from "./Button";

// ❌ 禁止 — 通过 barrel 导入同目录组件（可能循环）
import { Button } from "@/shared/ui";
```

### Task 6.7: 环境变量类型声明

在 `src/vite-env.d.ts` 中补充：

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_USE_NEW_ARCH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### Task 6.7: 功能回归测试清单

| 路由 | 预期 |
|------|------|
| `/` → `/showroom` | 展厅列表渲染，筛选正常 |
| `/procurement` | UNSPSC 选择器 + 公告列表 + 分页 |
| `/supplier` | 供应商卡片列表 + 类型/行业筛选 |
| `/crm` | 未登录 → 重定向 + 弹窗；已登录 → 正常渲染 |
| `/services` | 6 张服务卡片 |
| `/learning` | 材料列表 + FAQ |
| `/membership` | VIP 卡片 + 权益网格 |
| `/training` | 报名表单 |
| 语言切换 | 中英切换正常 |
| 浏览器前进/后退 | 路由正确变更 |
| 401 事件 | 弹出登录弹窗 |

---

## 文件统计

| 层级 | 文件数 | 备注 |
|------|--------|------|
| `types/` | 9 | exhibition / supplier / crm / learning / auth / payment / procurement / membership + barrel |
| `data/` | 6 | exhibition-halls / suppliers / opportunities / materials / faqs + barrel |
| `core/auth/` | 3 |
| `core/i18n/` | 5 |
| `core/http/` | 3 |
| `core/payment/` | 3 |
| `shared/ui/` | 12（含 ErrorBoundary + PaymentModal） |
| `shared/layout/` | 6（含 ProtectedRoute） |
| `shared/filters/` | 3 |
| `shared/forms/` | 3 |
| `routes.tsx` | 1 |
| `features/showroom/` | 8（含 api.ts） |
| `features/procurement/` | 11 |
| `features/supplier/` | 8 |
| `features/crm/` | 11 |
| `features/services/` | 5 |
| `features/learning/` | 7 |
| `features/membership/` | 7 |
| `features/training/` | 6 |
| `features/auth/` | 7 |
| `__tests__/` | 8 |
| **总计** | **~131** |
