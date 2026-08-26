# ADR-0002: API 端点清册与基线指标

- **状态**：已接受
- **日期**：2026-08-26
- **阶段**：Phase 0.2

## 决策

以本文档附录的端点清册作为 Phase 4 逐域迁移的 tick-list。迁移前不单独采集 Lighthouse / Core Web Vitals 基线（Phase 6 验收时与历史对比即可）。

## 端点清册

来源：`server/app.ts` 路由挂载顺序 + 各 `*.routes.ts` 文件。

切换顺序（与迁移计划附录 A 一致）：

system → auth → notices → suppliers → membership → payment → training → catalog → opportunities → user-prefs → ai → qualification → leads → admin

| 域 | 端点 | 认证 | 状态 |
|----|------|------|------|
| system | `GET /api/system/icp`、`/links`、`/version`、`GET /sitemap.xml` | 公开 | ☐ |
| auth | `POST /api/auth/login`、`GET /api/auth/user`、`POST /api/auth/refresh`、`POST /api/auth/logout` | 混合 | ☐ |
| auth | `POST /api/auth/check-email-phone`、`forgot-password`、`reset-password`、`send-register-code`、`register` | 公开+限流 | ☐ |
| auth | `POST /api/auth/send-phone-code`、`bind-phone`、`rebind-phone`、`unbind-phone` | requireAuth+限流 | ☐ |
| notices | `GET /api/notices/unified-search`、`countries`、`agencies`、`stats` | 公开 | ☐ |
| notices | `POST /api/notices/feedback`、`GET /api/notices/unlocks` | requireAuth | ☐ |
| notices | `POST /api/notices/:id/view`、`unlock`、`interest` | requireAuth+限流 | ☐ |
| notices | `GET /api/notices/:id/detail`、`content`、`preview`、`translation`、`report/preview`、`report` | requireAuth | ☐ |
| suppliers | `GET /api/suppliers`、`GET /api/suppliers/:id/contact` | 列表公开/contact 需登录 | ☐ |
| suppliers | `POST /api/suppliers`、`POST /api/supplier-claims` | requireAuth+限流 | ☐ |
| membership | `GET /api/membership/plans`、`/status`、`/upgrade/preview` | 混合 | ☐ |
| payment | `POST /api/billing/subscribe`、`POST /api/payment/orders`、`GET /api/payment/orders`、`GET /api/payment/unlocks`、`GET /api/payment/orders/:orderNo`、`GET /api/payment/alipay/redirect/:orderNo`、`GET /api/payment/config-status` | 混合 | ☐ |
| payment | `POST /api/payment/notify/alipay`、`POST /api/payment/notify/wechat`、`GET /api/payments/config-status`、`POST /api/payments/:orderNo/mock-paid` | 回调公开/其余鉴权 | ☐ |
| training | `POST /api/training/register`、`downloads/track`、`GET /api/training/downloads/stats`、`GET /api/training/landing`、`POST /api/training/orders`、`GET /api/training/orders/:order_no`、`GET .../alipay-redirect`、`POST .../mock-paid`、`GET\|POST .../participants` | 混合 | ☐ |
| catalog | `GET /api/certifications`、`/api/unspsc/industries`、`/children`、`/search`、`/smart-infer`、`/api/catalog/country-name-map` | 公开 | ☐ |
| opportunities | `GET /api/opportunities`、`unlocks`、`:id/translation`、`POST :id/view`、`POST :id/unlock` | 混合+限流 | ☐ |
| user-prefs | `GET\|POST /api/user/industry-prefs` | requireAuth | ☐ |
| ai | `POST /api/ai/matchmake` | requireAuth+限流 | ☐ |
| qualification | `POST /api/supplier-qualification` | 公开+限流(10/min) | ☐ |
| leads | `GET\|POST /api/leads`、`POST /api/leads/log` | admin/auth | ☐ |
| admin | `POST /api/admin/sync-bridge`、`backfill-amounts`、`rollup-views`、`GET\|POST /api/admin/quality-snapshot`、`GET /api/admin/reco-ab-metrics`、`GET\|POST /api/admin/retry-translation`、`GET /api/procurement/schema-status` | requireAdmin | ☐ |
| admin | `POST /api/admin/users/:userKey/reset-password`、`reset-email`、`GET /api/admin/email-logs` | requireAdmin | ☐ |

## 基线指标

- **Google 收录页面数**：迁移后对比（Phase 6 验收）。
- **Lighthouse**：Phase 6 在生产环境跑全量页面对比。
- **爬虫预渲染验证**：`curl -H "User-Agent: Googlebot" http://localhost:3039/showroom` 确认服务端 HTML 含翻译文本（Phase 3 验收）。

## 理由

端点清册已在迁移计划附录 A 中完整列出，无需重复采集。基线指标在 Phase 6 统一对比即可，避免迁移期数据波动干扰判断。
