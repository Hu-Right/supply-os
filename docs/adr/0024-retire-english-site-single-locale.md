# ADR-0024：下线英文独立站，站点单语化；i18n 只做界面语言，不承担 SEO

- 状态：已接受（2026-11-25）
- 关联：ADR-0023（不做只给 AI 看的页面）、`src/app/(en)`（本次删除）、`src/core/i18n/navigation.ts`（本次删除）
- 涉及仓库：`supply-os`（对外内容面、i18n、sitemap、proxy）

## 1. 背景

`/en` 是 2026-11-18 为 SEO 新增的独立根布局站点（`ccd24fa0`），11-25 又扩成 7 个静态页 + 公告/供应商两类详情页。上线后的实测结果：

- 百度 `site:osneosmart.com`、Bing `site:` 均 **0 收录**，英文站没有带来任何搜索流量；
- 内容没有翻译：英文列表用 `titleEn || title`，而 `title_en` 实际为空，页面直接显示拉脱维亚语/葡语等原文；英文详情页只用 `p.title`，连英文标题字段都不读；
- 无登录、注册、价格、购买入口，0 转化能力；
- 与中文站是两套 shell、两套 hreflang、两套 canonical、两套 sitemap 条目，每次改导航/文案都要同步两份；
- 缺陷清单：详情页 CTA 指向已删除的 `/procurement?notice_id=`、页脚链中文法律页、每页 170–240 个中文字符残留、移动端无导航、hreflang 单向。

同时，中文站自身的关键路径被 i18n 拖累：`/supplier/[id]`、`/procurement/countries`、`/procurement/industries` 调用 `getServerLocale()` 读 Cookie → 被迫动态渲染、无法缓存。

## 2. 决策

### 2.1 删除 `/en` 整站，不保留跳转

`src/app/(en)` 全部 12 个文件删除后，`/en*` 直接返回 404。**不配置 308/301 兼容跳转**（2026-11-25 用户决策：旧的一律删除、不做向后兼容）。若未来需要给外链留权重，再单独加回 redirects。

### 2.2 站点单语：SEO/GEO 只作用于中文内容

- 删除 `src/app/(en)` 全部 12 个文件；
- 首页、`/procurement`、公告详情、供应商详情的 `alternates.languages` 去掉 `en`，只留 `zh-CN` + `x-default`；
- sitemap 静态片删除 7 条 `/en` URL，供应商条目删除 `alternates.en`；
- 404 页删除 “English home” 入口。

### 2.3 i18n 降级为「界面语言」，不参与 URL 与 metadata

- 删除 `core/i18n/navigation.ts`（`isEnglishPath` / `stripEnglishPrefix` / `englishPathFor` / `localeHref`）及其单测；
- 语言切换器与移动端抽屉：只写 Cookie、原地加载语言包，**不再做任何导航**；
- `LocaleProvider` 去掉 `initialLocale` 参数（唯一调用方是已删除的英文根布局）；
- 新增硬约束：**同一 URL 的 `title` / `description` 不随 Cookie 变化**——SEO 文案固定中文，避免搜索引擎看到的中文与用户看到的英文不一致。

### 2.4 SEO 页面与服务端语言解耦

删除 `src/lib/i18n/server.ts`（`getServerLocale` / `getServerI18n` 已无调用方）。`/supplier/[id]`、`/procurement/countries`、`/procurement/industries` 固定 `zh` 文案，不再读 Cookie —— 这三页恢复可缓存（ISR/静态直出），这是本次最直接的 SEO 收益。

### 2.5 外语 SEO 的前置条件（将来满足才开）

1. 目标语言有**可读内容**（标题、摘要至少机翻并落库）；
2. **path 化路由**（`/en/...` 形态）；
3. **服务端直出**目标语言 HTML；
4. **双向 hreflang** + 独立 canonical + 进 sitemap。

四者缺一不开。禁止用 Cookie i18n 冒充外语内容面。

## 3. 后果

- `/en*` 全部 308；线上下次部署后生效；
- sitemap 静态片从 967 → 960 条，无 `/en`；
- 三个 SEO 页面恢复可缓存；`proxy.ts` 少一个 URL-语言分支；
- 保留：`core/i18n/locales/en/*` 语言包（产品内界面语言）、公告译文权益（`notice_translations`）——那是功能，不是站点；
- 若未来做海外：按 2.5 重建，不复用本次删除的壳。

## 4. 回滚

从 git 恢复 `src/app/(en)`、`src/core/i18n/navigation.ts`、`src/lib/i18n/server.ts` 与各页 `alternates.en` 即可；`next.config.ts` 的 redirects 需同时删除，否则新页面不可达。
