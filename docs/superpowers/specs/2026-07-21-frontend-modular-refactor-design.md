# Supply-OS 前端模块化重构 — 架构设计文档

> **日期：** 2026-07-21  
> **范围：** 仅前端（React + TypeScript），不涉及后端 `server.ts`  
> **目标：** 将 2575 行巨型 `App.tsx` 按高内聚低耦合原则拆分为模块化架构

---

## 一、当前问题诊断

| 问题 | 严重程度 | 表现 |
|------|----------|------|
| **巨型单体组件** | 🔴 致命 | `App.tsx` **2575行**，包含认证、7个Tab页、表单、弹窗、拖拽上传等全部逻辑 |
| **私有内嵌组件** | 🟠 严重 | `ProcurementNoticesPool.tsx` 内嵌了 `ManualPaymentModal`（约85行），无法独立复用 |
| **职责混乱** | 🟠 严重 | 状态管理、API调用、UI渲染、表单验证全部耦合在一个文件中 |
| **表单逻辑重复** | 🟡 中等 | 展厅入驻/供应商注册/咨询预约/培训报名四套表单各自实现，无共享 hooks |
| **大量 props drilling** | 🟡 中等 | 状态全在 App 顶层的 `useState`，通过 props 层层传递 |
| **数据层无抽离** | 🟡 中等 | API fetch 分散在各组件中，无统一请求层 |
| **类型定义混杂** | 🟢 轻微 | `types.ts` 把所有领域类型堆在一起，但文件不大 |
| **数据文件过大** | 🟢 轻微 | `data.ts` 539行包含5种实体类型的 mock 数据 |

---

## 二、技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 状态管理 | **React Context + 自定义 Hooks** | 项目5800行，无需引入 Redux/Zustand；AuthContext 管认证，各模块用 useState/useReducer 自治 |
| 模块内部组织 | **按技术层水平拆分**（pages/components/hooks 三层子目录） | 结构清晰，新开发者一眼能定位 |
| 依赖方向 | types → data → core → shared → features → App | 严格单向，禁止反向依赖 |

---

## 三、目标目录结构

```
src/
├── main.tsx
├── App.tsx                            # 编排层 目标 <80 行
├── index.css
├── vite-env.d.ts
│
├── core/                              # 基础设施层（跨领域共用）
│   ├── auth/
│   │   ├── AuthContext.tsx            # 认证状态 Context + Provider
│   │   └── types.ts                  # AuthUser 类型
│   ├── i18n/
│   │   ├── LocaleContext.tsx         # 从 locales/ 迁移
│   │   ├── LocaleProvider.tsx
│   │   ├── zh.json
│   │   ├── en.json
│   │   └── types.ts
│   └── http/
│       └── api-client.ts            # 统一 fetch 封装（base URL、错误处理、缓存去重）
│
├── shared/                            # 共享 UI 组件层
│   ├── ui/                           # 原子化通用组件（纯展示，无业务）
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Modal.tsx                # 通用弹窗壳
│   │   ├── Badge.tsx
│   │   ├── Card.tsx
│   │   ├── EmptyState.tsx
│   │   ├── Spinner.tsx
│   │   └── SearchInput.tsx
│   ├── layout/                       # 布局组件
│   │   ├── AppHeader.tsx            # 顶部导航 + 语言/用户信息
│   │   ├── AppSidebar.tsx           # 移动端汉堡菜单
│   │   ├── TabNav.tsx               # 桌面端 7 个 Tab 导航
│   │   └── PageBanner.tsx           # 动态标题横幅
│   ├── filters/                      # 通用筛选组件
│   │   ├── RegionFilter.tsx         # 地区 → 国家 联动
│   │   └── IndustryFilter.tsx
│   └── forms/                        # 通用表单组件
│       ├── FormField.tsx            # label + input/select 包装
│       └── FileDropZone.tsx         # 拖拽上传区
│
├── features/                          # 业务功能模块
│   ├── showroom/                      # Tab 1: 海外展厅
│   │   ├── pages/
│   │   │   └── ShowroomPage.tsx     # 入口：组装列表 + 筛选 + 表单
│   │   ├── components/
│   │   │   ├── ShowroomList.tsx     # 展厅卡片网格
│   │   │   ├── ShowroomCard.tsx     # 单个展厅卡片
│   │   │   ├── ShowroomFilters.tsx  # 搜索 + 地区 + 国家
│   │   │   └── RegisterForm.tsx     # 展厅入驻表单
│   │   └── hooks/
│   │       └── useShowroomFilter.ts
│   │
│   ├── procurement/                   # Tab 2: 采购公告池
│   │   ├── pages/
│   │   │   └── ProcurementPage.tsx
│   │   ├── components/
│   │   │   ├── ProcurementPool.tsx
│   │   │   ├── NoticeList.tsx
│   │   │   ├── NoticeCard.tsx
│   │   │   ├── NoticeDetail.tsx
│   │   │   ├── UnspcsSelector.tsx   # 5 级级联
│   │   │   ├── ManualPaymentModal.tsx  # 从私有组件提升为独立组件
│   │   │   └── MembershipStatusBar.tsx
│   │   └── hooks/
│   │       ├── useNotices.ts
│   │       ├── useMembership.ts
│   │       └── useDetailQuota.ts
│   │
│   ├── supplier/                      # Tab 3: 供应商目录
│   │   ├── pages/
│   │   │   └── SupplierPage.tsx
│   │   ├── components/
│   │   │   ├── SupplierList.tsx
│   │   │   ├── SupplierCard.tsx
│   │   │   ├── SupplierFilters.tsx
│   │   │   └── RegisterForm.tsx
│   │   └── hooks/
│   │       └── useSupplierFilter.ts
│   │
│   ├── crm/                           # Tab 4: CRM
│   │   ├── pages/
│   │   │   └── CrmPage.tsx
│   │   ├── components/
│   │   │   ├── StatsCards.tsx
│   │   │   ├── OpportunityList.tsx
│   │   │   ├── LeadTracker.tsx
│   │   │   ├── LeadCard.tsx
│   │   │   └── FollowUpLogPanel.tsx
│   │   ├── AiMatchmaker.tsx         # AI 匹配工作台
│   │   └── hooks/
│   │       ├── useLeads.ts
│   │       └── useAiMatch.ts
│   │
│   ├── services/                      # Tab 5: 服务生态
│   │   ├── pages/
│   │   │   └── ServicesPage.tsx
│   │   ├── components/
│   │   │   ├── ServiceCard.tsx
│   │   │   └── SuccessStories.tsx
│   │
│   ├── learning/                      # Tab 6: 学习中心
│   │   ├── pages/
│   │   │   └── LearningPage.tsx
│   │   ├── components/
│   │   │   ├── MaterialList.tsx
│   │   │   ├── MaterialCard.tsx
│   │   │   └── FaqPanel.tsx
│   │   └── hooks/
│   │       └── useDownload.ts
│   │
│   ├── membership/                    # Tab 7: 会员专区
│   │   ├── pages/
│   │   │   └── MembershipPage.tsx
│   │   ├── components/
│   │   │   ├── VipCard.tsx
│   │   │   ├── PrivilegeGrid.tsx
│   │   │   └── ContactForm.tsx
│   │
│   ├── training/                      # 独立路由: 研修班报名
│   │   ├── pages/
│   │   │   └── TrainingPage.tsx
│   │   ├── components/
│   │   │   └── TrainingRegisterModal.tsx
│   │   └── hooks/
│   │       └── useTrainingForm.ts
│   │
│   ├── auth/                          # 认证 UI
│   │   ├── pages/
│   │   │   └── AuthModal.tsx
│   │   ├── components/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   └── SupplierClaimForm.tsx
│   │   └── hooks/
│   │       └── useAuth.ts
│   │
│   └── payment/                       # 支付模块
│       ├── pages/
│       │   └── PaymentModal.tsx
│       ├── components/
│       │   └── ProviderSelector.tsx
│       ├── env-detector.ts
│       ├── types.ts
│       └── hooks/
│           └── usePayment.ts
│
├── data/                              # 静态数据（Mock/Seed）
│   ├── exhibition-halls.ts
│   ├── suppliers.ts
│   ├── opportunities.ts
│   ├── materials.ts
│   └── faqs.ts
│
├── types/                             # 领域类型定义
│   ├── exhibition.ts
│   ├── supplier.ts
│   ├── lead.ts
│   ├── opportunity.ts
│   ├── learning.ts
│   └── payment.ts
│
└── assets/                            # 静态资源
    └── wechat-service-qr.png
```

---

## 四、文件变更对照表

| 原文件 | 操作 | 目标位置 |
|--------|------|----------|
| `src/App.tsx` (2575行) | **重写** | → `App.tsx` (<80行) + 分散到 `features/*/` 和 `shared/layout/*` |
| `src/types.ts` | **拆分** | → `types/exhibition.ts`, `types/supplier.ts`, `types/lead.ts`, `types/opportunity.ts`, `types/learning.ts` |
| `src/data.ts` | **拆分** | → `data/exhibition-halls.ts`, `data/suppliers.ts`, `data/opportunities.ts`, `data/materials.ts`, `data/faqs.ts` |
| `src/locales/LocaleContext.tsx` | **迁移** | → `core/i18n/LocaleContext.tsx` |
| `src/locales/zh.json` | 保留 | → `core/i18n/zh.json` |
| `src/locales/en.json` | 保留 | → `core/i18n/en.json` |
| `src/locales/types.ts` | 保留 | → `core/i18n/types.ts` |
| `src/ProcurementNoticesPool.tsx` (775行) | **拆分** | → `features/procurement/pages/ProcurementPage.tsx` + `components/*` (ManualPaymentModal 提升为独立组件) |
| `src/TrainingPage.tsx` | **迁移** | → `features/training/pages/TrainingPage.tsx` |
| `src/TrainingRegisterModal.tsx` | **迁移** | → `features/training/components/TrainingRegisterModal.tsx` |
| `src/PaymentModal.tsx` | **迁移** | → `features/payment/pages/PaymentModal.tsx` |
| `src/payment/types.ts` | **迁移** | → `features/payment/types.ts` |
| `src/payment/env-detector.ts` | **迁移** | → `features/payment/env-detector.ts` |
| `src/payment/PaymentService.ts` | **移除** | 纯后端代码（SQL操作），保留在 `server.ts` 中，前端不需要 |
| `src/payment/AlipayProvider.ts` | **移除** | 纯后端代码，保留在 `server.ts` 中 |
| `src/payment/WechatProvider.ts` | **移除** | 纯后端代码，保留在 `server.ts` 中 |
| `src/payment/MockProvider.ts` | **移除** | 纯后端代码，保留在 `server.ts` 中 |
| `src/main.tsx` | **微调** | 引入 `AuthProvider` 包裹 |
| 新增 | **创建** | `core/http/api-client.ts`, `core/auth/AuthContext.tsx`, `shared/ui/*`, `shared/layout/*`, `shared/forms/*`, 所有 `features/*/hooks/*` |

---

## 五、状态管理架构

```
┌─────────────────────────────────────────────────────┐
│                    main.tsx                          │
│         <LocaleProvider>  ← core/i18n               │
│           <AuthProvider>  ← core/auth               │
│             <App />                                 │
└─────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    AppHeader        PageBanner      {activeTab === N && <XxxPage/>}
     useLocale()      useLocale()
     useAuth()                        ┌──────────────┐
                                      │ 各 Page 组件  │
                                      │ 内部自治状态  │
                                      │ useState /   │
                                      │ useReducer   │
                                      └──────────────┘
```

### Context 层（仅 2 层）

| Context | 职责 | 提供值 |
|---------|------|--------|
| `LocaleContext` | 语言切换 | `locale`, `setLocale`, `t()` |
| `AuthContext` | 用户认证/VIP状态 | `authUser`, `isVip`, `login()`, `register()`, `logout()`, `refreshAuth()`, `submitSupplierClaim()` |

### 各模块内部自治状态（useState/useReducer）

- 展厅/供应商筛选条件
- 表单输入值
- 列表数据 + loading + error
- AI 匹配结果
- CRM 操作日志

---

## 六、依赖方向规则

```
types/  ←  纯类型，零依赖
  ↑
data/  ←  依赖 types/
  ↑
core/  ←  依赖 types/（i18n 依赖 JSON）
  ↑
shared/  ←  依赖 core/i18n（仅 useLocale），不依赖 features/
  ↑
features/  ←  依赖 core/ + shared/ + data/ + types/
  ↑
App.tsx  ←  依赖 core/auth + shared/layout + features/
```

### 依赖矩阵

```
                  types   data   core   shared   features   App
types              -      ✗      ✗       ✗        ✗        ✗
data               ✓      -      ✗       ✗        ✗        ✗
core               ✓      ✗      -       ✗        ✗        ✗
shared             ✓      ✗      ✓       -        ✗        ✗
features           ✓      ✓      ✓       ✓        -        ✗
App                ✓      ✗      ✓       ✓        ✓        -
```

（✓ = 允许依赖，✗ = 禁止依赖）

---

## 七、核心接口定义

### 7.1 AuthContext

```ts
// core/auth/AuthContext.tsx
interface AuthContextValue {
  authUser: AuthUser | null;
  isVip: boolean;
  isAuthLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (form: RegisterForm) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  submitSupplierClaim: (claim: SupplierClaimForm) => Promise<void>;
}
```

### 7.2 API Client

```ts
// core/http/api-client.ts
function api<T>(endpoint: string, options?: RequestInit): Promise<T>;
function apiCached<T>(endpoint: string): Promise<T>;
```

### 7.3 共享 UI 组件接口（代表性示例）

```tsx
// shared/ui/Modal.tsx
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

// shared/ui/Button.tsx
interface ButtonProps {
  variant: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
}

// shared/forms/FileDropZone.tsx
interface FileDropZoneProps {
  files: string[];
  onFilesChange: (files: string[]) => void;
  accept?: string;
  multiple?: boolean;
}
```

### 7.4 关键 Hook 接口

```ts
// features/crm/hooks/useLeads.ts
function useLeads(): {
  leads: Lead[];
  isLoading: boolean;
  activeLead: Lead | null;
  setActiveLead: (lead: Lead | null) => void;
  addFollowUpLog: (leadId: string, content: string, status: string) => Promise<void>;
  refreshLeads: () => Promise<void>;
};

// features/procurement/hooks/useNotices.ts
function useNotices(codeId: string, page: number): {
  items: NoticeItem[];
  total: number;
  loading: boolean;
  error: string;
};

// features/showroom/hooks/useShowroomFilter.ts
function useShowroomFilter(): {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  selectedRegion: string;
  setSelectedRegion: (v: string) => void;
  selectedCountry: string;
  setSelectedCountry: (v: string) => void;
  filteredShowrooms: ExhibitionHall[];
  availableRegions: string[];
  availableCountries: string[];
  resetFilters: () => void;
};
```

---

## 八、App.tsx 重构目标形态

```tsx
// App.tsx — 重构后 <80 行
function App() {
  const [activeTab, setActiveTab] = useState(1);
  const [isTrainingRoute, setIsTrainingRoute] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState(null);

  useHashRoute(setActiveTab, setIsTrainingRoute);

  return (
    <div className="min-h-screen bg-slate-50 ...">
      <AppHeader
        onAuthClick={() => setShowAuthModal(true)}
      />
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
      <main>
        <PageBanner activeTab={activeTab} />
        {isTrainingRoute && <TrainingPage />}
        {!isTrainingRoute && activeTab === 1 && <ShowroomPage />}
        {!isTrainingRoute && activeTab === 2 && <ProcurementPage />}
        {!isTrainingRoute && activeTab === 3 && <SupplierPage />}
        {!isTrainingRoute && activeTab === 4 && <CrmPage />}
        {!isTrainingRoute && activeTab === 5 && <ServicesPage />}
        {!isTrainingRoute && activeTab === 6 && <LearningPage />}
        {!isTrainingRoute && activeTab === 7 && <MembershipPage />}
      </main>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showPaymentModal && (
        <PaymentModal
          plan={paymentPlan}
          onClose={() => setShowPaymentModal(false)}
        />
      )}
    </div>
  );
}
```

### App.tsx 内容迁移对照

| 原 App.tsx 内容（2575行） | 迁移目标 |
|--------------------------|----------|
| 认证逻辑（authUser, login, register, logout, submitAuth） | `core/auth/AuthContext.tsx` |
| 顶部 Header + 移动端菜单 | `shared/layout/AppHeader.tsx` + `AppSidebar.tsx` |
| 桌面 Tab 导航（7个按钮） | `shared/layout/TabNav.tsx` |
| 页面标题横幅 + 操作按钮 | `shared/layout/PageBanner.tsx` |
| 展厅列表 + 筛选 + 入驻表单 | `features/showroom/` |
| 采购公告池 + UNSPSC + ManualPayment | `features/procurement/` |
| 供应商目录 + 注册表单 | `features/supplier/` |
| CRM 指标 + 线索 + 机会 + AI 匹配 | `features/crm/` |
| 服务生态 6 卡 + 成功案例 | `features/services/` |
| 学习材料列表 + FAQ | `features/learning/` |
| 会员 VIP 卡 + 权益 + 联系表单 | `features/membership/` |
| 研修班报名独立页面 | `features/training/` |
| 认证弹窗（登录/注册/SupplierClaim） | `features/auth/` |
| 支付弹窗（选择渠道/等待/成功/失败） | `features/payment/` |
| 拖拽上传模拟器 | `shared/forms/FileDropZone.tsx` |

---

## 九、实施阶段与优先级

| 阶段 | 内容 | 文件数变化 | 风险 |
|------|------|-----------|------|
| **Phase 1:** 拆分 `types.ts` + `data.ts` | 5 个类型文件 + 5 个数据文件 | 2 → 10 | 极低 |
| **Phase 2:** 建立 `shared/ui/` + `shared/layout/` | 16 个共享组件 | +16 | 低 |
| **Phase 3:** 将 App.tsx 中 7 个 Tab 提取为 feature pages | 7 个 Page 组件 | App 从 2575 → ~600 | 中 |
| **Phase 4:** 各 Page 内部进一步拆分子组件 | ~25 个业务组件 | +25 | 中 |
| **Phase 5:** 建立 `core/auth/` + `core/http/` + `hooks/` | AuthContext + api-client + 12 hooks | +14 | 中 |
| **Phase 6:** App.tsx 瘦身为纯编排层 | App.tsx <80 行 | - | 低 |

---

## 十、关键边界注意

1. **`src/payment/PaymentService.ts`** — 该文件包含 SQL 操作（`dbPool.query`），属于后端代码却放在前端 `src/` 目录。重构时应将其逻辑保留在 `server.ts` 或移至独立的 `server/services/` 目录。前端 `features/payment/` 只保留 UI 层 + `env-detector.ts`。

2. **`TrainingRegisterModal` vs `TrainingPage` 表单逻辑重复** — 两个组件使用相同的 fetch + form state 模式，Phase 5 通过 `useTrainingForm.ts` hook 统一复用。

3. **所有 `useLocale()` 调用保持兼容** — 只改 import 路径从 `./locales/` → `core/i18n/`，函数签名不变。

4. **后台支付服务文件** — `src/payment/AlipayProvider.ts`、`WechatProvider.ts`、`MockProvider.ts` 均为 `PaymentService.ts` 的策略实现，不包含前端 UI 代码，应从 `src/` 目录移除。

5. **渐进式迁移** — 每完成一个 Phase，App.tsx 保持可运行状态，不需要等全部完成。
