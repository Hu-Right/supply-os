# i18n 剩余工作 — 实施说明文档

> **日期：** 2026-07-21  
> **上下文：** 已完成 react-i18next 迁移 + `src/locales/` → `@/core/i18n/` 搬迁（含 `i18next.d.ts` 类型增强、`fallbackLng: "en"`、`count`→`num` 保留字修复）。本文档描述 i18n 方面尚需完成的改进，供后续按序执行。  
> **红线：** 严格按本文逐项实施，不做任何未列出的额外改动。

---

## 前置状态

| 项 | 当前值 |
|----|--------|
| i18next 版本 | `^26.3.6` |
| react-i18next 版本 | `^17.0.10` |
| i18n 位置 | `src/core/i18n/LocaleContext.tsx` |
| i18next 类型增强 | `src/core/i18n/i18next.d.ts`（声明 `defaultNS` + `returnNull`；未绑定 resources，避免 `t()` 重载歧义） |
| zh.json / en.json key 数量 | 359 对，完全对齐 |
| `LocaleKey` 类型 | 从 `zh.json` 自动推导 |
| `fallbackLng` | `"en"`（缺 key 回退英文） |
| 插值语法 | 单花括号 `{param}`（`prefix:"{"`, `suffix:"}"`, `escapeValue:false`） |
| `main.tsx` 导入 | `import { LocaleProvider } from '@/core/i18n'` |
| i18next 实例导入 | `import * as i18nModule from "i18next"; const i18n = (i18nModule as any).default || i18nModule;`（因 `tsconfig.json` 未开 `esModuleInterop`） |
| `detectLocale()` | 当前只识别 `zh`/`en`；加第 3 种语言时需扩展映射表 |

---

## 任务 1：ErrorBoundary 多语言（方案 B）

### 问题

`src/main.tsx` 的 ErrorBoundary 在 `<LocaleProvider>` 外层，硬编码中文：

- 第 39 行：`<h1>页面渲染异常</h1>`
- 第 41 行：`当前页面组件加载失败，已阻止整站白屏。请刷新页面或返回首页重试。`
- 第 56 行：`<button>返回首页</button>`

### 方案 B：ErrorBoundary 独立加载 i18next

ErrorBoundary 保持在 `<LocaleProvider>` 外面，自己通过模块级 `i18next` 实例直取翻译（不依赖 Provider/Context）。原因是 Provider 自身崩溃时 ErrorBoundary 必须能独立工作。

### 步骤

#### Step 1：新增 3 个 i18n key

在 `src/core/i18n/zh.json` 最后追加（注意 `membershipSendEmailAlert` 末尾**需要加逗号**，因为后面还有新 key）：

```json
  "membershipSendEmailAlert": "已将权益介绍书发送至: {email}",
  "errorBoundaryTitle": "页面渲染异常",
  "errorBoundaryDesc": "当前页面组件加载失败，已阻止整站白屏。请刷新页面或返回首页重试。",
  "errorBoundaryBackHome": "返回首页"
}
```

在 `src/core/i18n/en.json` 同样位置追加：

```json
  "membershipSendEmailAlert": "Membership info sent to: {email}",
  "errorBoundaryTitle": "Page Rendering Error",
  "errorBoundaryDesc": "A component failed to load. The page has been stopped to prevent a white screen. Please refresh or return to the home page.",
  "errorBoundaryBackHome": "Back to Home"
}
```

#### Step 2：改造 `src/main.tsx`

```tsx
import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '@/core/i18n';
import * as i18nModule from 'i18next';  // ← 新增：因 tsconfig.json 未开 esModuleInterop，不能用 import i18n from 'i18next'
const i18n = (i18nModule as any).default || i18nModule;  // ← 取模块级单例实例（与 LocaleContext.tsx 中初始化的是同一个）
import App from './App.tsx';
import './index.css';

type ErrorBoundaryProps = {
    children: ReactNode;
};

type ErrorBoundaryState = {
    hasError: boolean;
    message: string;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = {
        hasError: false,
        message: '',
    };

    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
        return {
            hasError: true,
            message: error instanceof Error ? error.message : String(error),
        };
    }

    componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
        console.error('[SupplyOS] React render error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // 方案 B：不在 Provider 内，直接用 i18n.t() 取翻译
            const t = i18n.getFixedT(i18n.language || 'en');  // ← 关键：回退语言用 'en'，与项目 fallbackLng: "en" 策略一致
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-800">
                    <div className="max-w-lg w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                        <p className="text-xs font-bold uppercase tracking-widest text-teal-600">Supply OS</p>
                        <h1 className="mt-2 text-xl font-extrabold">{t("errorBoundaryTitle")}</h1>
                        <p className="mt-2 text-sm text-slate-500">
                            {t("errorBoundaryDesc")}
                        </p>
                        {this.state.message && (
                            <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
                                {this.state.message}
                            </pre>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                window.location.href = '/showroom';  // ← 用 react-router-dom 路由路径，不操作 hash
                            }}
                            className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                        >
                            {t("errorBoundaryBackHome")}
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <LocaleProvider>
                <App />
            </LocaleProvider>
        </ErrorBoundary>
    </StrictMode>,
);
```

**关键点说明：**
- `import * as i18nModule from 'i18next'` + `(i18nModule as any).default || i18nModule`：因 `tsconfig.json` 未开 `esModuleInterop`，`import i18n from 'i18next'` 会被 TS 解析为模块类型（`typeof import("i18next")`）而非实例，导致 `Property 'isInitialized' does not exist` 编译错误。此写法兼容 ESM/CJS 两种导出形态。
- `i18n.getFixedT(i18n.language || 'en')`：不依赖 Hook/Context 即可取翻译，`getFixedT` 返回一个绑定当前语言的 `t()` 函数。回退语言用 `'en'`（非 `'zh'`），与项目 `fallbackLng: "en"` 策略一致。
- `window.location.href = '/showroom'`：项目已引入 `react-router-dom`（Phase 0 完成），返回首页应走路由路径而非操作 `window.location.hash`（hash 伪路由已被替换）。
- 注意：import 顺序 —— `i18n` 的模块初始化由 `LocaleContext.tsx` 中 `import './zh.json'` 等触发，因此 `main.tsx` 加载时 i18next 已完成 `.init()`。`import * as i18nModule from 'i18next'` 和 `import { LocaleProvider } from '@/core/i18n'` 都是安全的。

---

## 任务 2：`src/App.tsx` 中 3 处硬编码文案 → `t()`

### 当前硬编码位置

**位置 1 — App.tsx 第 556 行**

```typescript
// 修改前：
setAiReport(locale === "zh" ? "匹配请求失败，请检查网络设置。" : "Matchmaker API error, please retry.");
```

**位置 2 — App.tsx 第 559 行**

```typescript
// 修改前：
setAiReport(locale === "zh" ? "链接API服务出现故障。" : "Connection error to Gemini service.");
```

### 步骤

#### Step 1：在 zh.json 和 en.json 中新增 2 个 key

在 `src/core/i18n/zh.json` 最后（`errorBoundaryBackHome` 行前或后均可）追加：

```json
  "aiMatchHttpError": "匹配请求失败，请检查网络设置。",
  "aiMatchNetworkError": "链接API服务出现故障。"
```

在 `src/core/i18n/en.json` 同样位置追加：

```json
  "aiMatchHttpError": "Matchmaker API error, please retry.",
  "aiMatchNetworkError": "Connection error to Gemini service."
```

#### Step 2：修改 App.tsx

第 556 行替换为：

```typescript
setAiReport(t("aiMatchHttpError"));
```

第 559 行替换为：

```typescript
setAiReport(t("aiMatchNetworkError"));
```

无需额外导入，`App.tsx` 已有 `const { t, locale, setLocale } = useLocale();`。

---

## 任务 3：新增 `pickLocale()` 工具函数（推迟到 Phase 5）

> **决策：** 本任务推迟到 Phase 5（App.tsx 拆分）时顺手处理，不阻塞当前进度。

### 原因

1. **Phase 5 要重写 `App.tsx`**（从 2576 行拆到 ~50 行），这些 `locale === "zh" ? X : Y` 会随组件拆分自然分散到各 feature 模块，届时再统一替换更合理。
2. **`pickLocale` 函数本身只有一行** `locale === "zh" ? zh : en`，抽象价值有限。
3. **当前 30 处三元表达式功能完全正确**，不是 bug，只是风格不统一。

### 原方案（保留供 Phase 5 参考）

#### Step 1：新建 `src/core/i18n/helpers.ts`

```typescript
/**
 * i18n 工具函数
 * i18n Utility Helpers
 *
 * @module core/i18n/helpers
 */

import type { Locale } from "./types";

/**
 * 从双语言字段中按当前 locale 选择对应值。
 * Pick a value from a bilingual field-pair based on the current locale.
 *
 * @example
 * pickLocale(locale, eh.nameZh, eh.nameEn)   // 根据当前语言返回中文或英文名
 */
export function pickLocale<T>(locale: Locale, zh: T, en: T): T {
  return locale === "zh" ? zh : en;
}
```

#### Step 2：修改 `src/core/i18n/index.ts` — 追加导出

在 barrel 末尾追加一行：

```typescript
export { pickLocale } from "./helpers";
```

#### Step 3：在 App.tsx 中使用

逐处将 `locale === "zh" ? XXXzh : XXXen` 替换为 `pickLocale(locale, XXXzh, XXXen)`。示例：

```tsx
// 修改前：
{locale === "zh" ? eh.nameZh : eh.nameEn}

// 修改后：
{pickLocale(locale, eh.nameZh, eh.nameEn)}
```

App.tsx 中需新增导入：
```typescript
import { useLocale, pickLocale } from "@/core/i18n";
```

**需要替换的位置清单（App.tsx 中约 30 处）：**

| 行号范围 | 模式 | 数量 |
|----------|------|------|
| 655-656 | `eh.regionZh` / `eh.regionEn`, `eh.countryZh` / `eh.countryEn` | 2 |
| 666 | `eh.regionZh` / `eh.regionEn` (在 `.map()` 内) | 1 |
| 673-674 | `eh.regionZh` / `eh.regionEn`, `eh.countryZh` / `eh.countryEn` | 2 |
| 694 | `sup.industryZh` / `sup.industryEn` | 1 |
| 706 | `s.industryZh` / `s.industryEn` | 1 |
| 1054 | `eh.regionZh` / `eh.regionEn` + `eh.countryZh` / `eh.countryEn` | 2 |
| 1057 | `eh.nameZh` / `eh.nameEn` | 1 |
| 1068 | `eh.descriptionZh` / `eh.descriptionEn` | 1 |
| 1075 | `eh.featuredProductsZh` / `eh.featuredProductsEn` | 1 |
| 1222 | `sup.nameZh` / `sup.nameEn` | 1 |
| 1228 | `sup.countryZh` / `sup.countryEn` + `sup.cityZh` / `sup.cityEn` | 2 |
| 1244 | `sup.mainProductsZh` / `sup.mainProductsEn` | 1 |
| 1255 | `sup.complianceLabelsZh` / `sup.complianceLabelsEn` | 1 |
| 1354 | `opp.industryZh` / `opp.industryEn` | 1 |
| 1359 | `opp.titleZh` / `opp.titleEn` | 1 |
| 1362 | `opp.descriptionZh` / `opp.descriptionEn` | 1 |
| 1408 | `s.nameZh` / `s.nameEn` | 1 |
| 1426 | `o.titleZh` / `o.titleEn` | 1 |
| 1741 | `lm.categoryZh` / `lm.categoryEn` | 1 |
| 1747 | `lm.titleZh` / `lm.titleEn` | 1 |
| 1751 | `lm.summaryZh` / `lm.summaryEn` | 1 |
| 1778 | `lm.contentZh` / `lm.contentEn` | 1 |

**注意：不是简单全局替换！** 以下 `locale === "zh"` 模式**不要改**：
- 第 760 行 `setLocale(locale === "zh" ? "en" : "zh")` — 语言切换按钮逻辑
- 第 764 行 `{locale === "zh" ? "English" : "中文"}` — 语言切换按钮文字（显示当前语言的另一语言名）
- 第 1518 行 `toLocaleString(...)` — 日期格式化（见任务 4）

---

## 任务 4：日期格式化（可选，建议保留现状）

### 问题

App.tsx 第 1518 行：

```typescript
{new Date(lead.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}
```

### 结论：**保留现状，不修改**

理由：
1. **语义更精确**：`zh-CN` 是地区标签（确保按中国大陆习惯显示日期），`zh` 只是语言标签。虽然多数浏览器行为一致，但显式指定地区更规范。
2. **未来扩展性**：将来加 `zh-TW`（繁体）时，显式映射更容易扩展（如 `locale === "zh" ? "zh-CN" : locale === "zh-TW" ? "zh-TW" : "en-US"`）。
3. **改动价值小**：只有 1 处，且当前功能完全正确。

如果一定要改，直接用 `locale` 替代三元即可（`toLocaleString(locale)`），但不推荐。

---

## 任务 5（可选，可推迟到 Phase 4）：Key 命名风格统一

### 问题

359 个 key 中约 130 个 `procurement_` 前缀的使用 snake_case，其余约 230 个使用 camelCase。这不影响功能，但增加认知负担。

### 建议

Phase 4 拆分 `features/procurement/` 时，用 `react-i18next` 的命名空间（namespace）重新组织：

```
core/i18n/
├── zh/
│   ├── common.json      # 通用 UI（brandName, cancel, resetFilter...）
│   ├── procurement.json  # 采购模块
│   ├── crm.json          # CRM 模块
│   └── ...
└── en/
    └── (同上)
```

然后在 `LocaleContext.tsx` 的 `init()` 中启用 `defaultNS: "common"`，各 feature 组件使用 `useTranslation("procurement")` 自动加前缀访问 `procurement:xxx`。

**当前不需要执行**，仅做记录。

---

## 验收标准

全部完成后运行：
```bash
npx tsc --noEmit && npx vite build --mode development
```

- TypeScript 编译零错误
- Vite 构建成功
- 切换语言后 ErrorBoundary 报错文案跟随语言变化
- AI 匹配失败时错误提示跟随语言变化
- 页面所有数据展示（展厅名、供应商名、产品列表等）仍正常显示中/英文

---

## 执行顺序建议

```
任务 1 → 任务 2 → 任务 4（可选）
（任务 3 推迟到 Phase 5，任务 5 推迟到 Phase 4/5）
```

任务 1-2 均需先修改 JSON 再修改 .tsx 文件。任务 3 的 `pickLocale()` 改动范围最大但也最机械（逐行替换 30 处），建议在 Phase 5 拆分 App.tsx 时顺手处理。

---

## 附录：后续扩展提醒

### 加第 3 种语言时必做

1. **扩展 `detectLocale()` 映射表**（`src/core/i18n/LocaleContext.tsx` 第 10-22 行）：当前只识别 `zh`/`en`，需添加新语言的 navigator 语言前缀映射。
2. **新增语言 JSON 文件**：如 `fr.json`、`ru.json`、`es.json`、`ar.json`，并在 `LocaleContext.tsx` 的 `resources` 中注册。
3. **RTL 支持**（阿拉伯语）：维护 `{ ar: "rtl", 其余: "ltr" }` 映射，切换语言时同步设置 `document.documentElement.dir` 和 `lang`；组件里用 Tailwind 的 `rtl:` 变体或逻辑属性。
4. **语言包懒加载**：6 语言不应全打进主包，改用 `i18next-resources-to-backend` 做 `import()` 懒加载。
5. **Intl 数字/货币/日期本地化**：接入 `interpolation.format` 统一调用 `Intl.NumberFormat` / `Intl.DateTimeFormat`。
