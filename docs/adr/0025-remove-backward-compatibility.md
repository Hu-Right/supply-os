# ADR-0025：移除全部向后兼容层，站内只保留「当前版本」的入口

- 状态：已接受（2026-11-25）
- 关联：ADR-0021（错误码体系）、ADR-0023（不做只给 AI 看的页面）、ADR-0024（英文站下线）
- 涉及仓库：`supply-os`（路由、客户端深链、错误码、sitemap 工具）

## 1. 背景

项目长期保留了一批「为老链接/老码/老调用而生」的兼容层。它们的共同特征是：**线上已没有生产者，只留消费者**——没有页面再生成这些 URL，没有路由再抛出这些错误码，但代码仍在为它们兜底。结果：

- 每加一个入口都要问「老链接怎么办」，兼容层只增不减；
- 兼容分支与主路径共享测试与心智负担，且经常掩盖真实缺陷（例如列表页的 `?notice_id=` 跳转承担了支付回跳对账的错觉）；
- 已下线的路由仍以重定向页存在，被扫站工具当作有效页面。

2026-11-25 用户拍板：**旧的一律删除，一切以当前版本为准，不做向后兼容。**

## 2. 决策

### 2.1 删除旧入口路由（改为一律 404）

| 删除对象 | 原行为 |
|---|---|
| `/billing` | 307 → `/settings/billing` |
| `/procurement/qualification` | 跳转 → `/procurement/diagnosis` |
| `/procurement/country/[slug]` | proxy 308 → `/procurement?country=XX`；未知 slug 404 |
| `/en` 及 `/en/*` | 英文站（ADR-0024）下线，**不再配 308 跳转** |

站内唯一引用点同步修正：`AccountOverview` 的费用中心链接改指 `/settings/billing`。

### 2.2 删除国别 slug 兼容层

`country-slug.ts` 删除 `landingSlug` / `SLUG_ALIASES` / `countrySlugParamMap`；`landing.ts` 删除 `slug` 字段与 `findCountryLanding()`（国别页下线后已无消费者，`slug` 只剩 React key 用途，改用 `name`）。保留 `countryParam` / `countryParamOfName`（仍在生成站内链接与 canonical）。

### 2.3 删除 `?notice_id=` 旧深链

- 删除 `features/procurement/lib/deepLink.ts` 与其单测；
- 删除列表页 `ProcurementPage` 中「旧链接 → 独立详情路由」的 `useEffect`；
- 支付回跳只认 `?order_no=&trade_no=`（公告 id 由详情路由自带），不再从列表页中转。

> 注意：`/membership?notice_id=`、`/services?notice_id=` 是**购买上下文参数**，属现行功能，保留。

### 2.4 删除 3 个 deprecated 错误码与别名机制

| 删除码 | 指向 |
|---|---|
| `EC_INVALID_REQUEST` (40022) | `EC_INVALID_PARAMS` (40000) |
| `EC_USER_REQUIRED` (40001) | `EC_AUTH_REQUIRED` (40042) |
| `EC_NOTICE_NOT_FOUND_LEGACY` (40006) | `EC_NOTICE_NOT_FOUND` (40404) |

同时删除 catalog 的 `deprecatedAliasOf` 字段与 `activeErrorDefs()` 的过滤、error-map 与相关单测/门禁白名单条目。目录从 111 码收敛为 108 个生效码，**同一语义只允许一个码**。

### 2.5 删除 deprecated 工具函数

`sitemap-sources.fetchSitemapNotices()`（旧的全量取第一片）删除，只保留 `fetchSitemapNoticesPage(offset, limit)`。

## 3. 不删的东西（不是兼容层）

- `src/lib/db/migrations/**`：数据库迁移是**账本与历史**，删除会让新环境无法建库；
- `legacy-map.ts` + `scripts/ops/orders-backfill.mts`：历史订单回填工具，属数据迁移，不是运行时兼容；
- `attribution-contract` 的 `legacy_tag`：这是**数据来源枚举值**（历史打标来源），不是代码兼容分支；
- `scripts/tools/daily-sync.cjs`：2026-11-13 起重新成为「爬虫库 → 主表」的唯一生产同步入口，是现行实现；
- 产品内的 `?notice_id=` 购买上下文（见 2.3 注）。

## 4. 后果

- 上述旧 URL 一律 404（部署后生效）；站内不再有指向它们的链接；
- 错误码体系只剩生效码，`check-error-codes` 仍要求「先登记再抛出」；
- 新增入口不再需要考虑「老链接」，但删除入口时必须同步清理站内引用，否则会留下死链。

## 5. 回滚

按文件从 git 恢复即可：三个路由目录、`country-slug.ts` / `landing.ts` 的兼容函数、`deepLink.ts`、catalog/error-map 的三个码。恢复后需同时恢复 `ProcurementPage` 的跳转 effect 与测试。
