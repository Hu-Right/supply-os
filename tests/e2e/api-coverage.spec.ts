/**
 * API 端点全量冒烟 + 契约断言 E2E
 *
 * @description 覆盖 src/app/api 下全部 route.ts 的每个 HTTP 方法（178 条 endpoint 用例）：
 *              - 每个用例断言 **精确状态码**（回归钉住，防止行为漂移）；
 *              - 2xx 断言裸载荷契约：数组/对象/JSON null/HTML，且不得是错误信封（禁止 {code,message} 混入成功响应）；
 *              - 4xx/410 断言错误信封契约：`{ code: number(非0), message: string }`；
 *              - GET 走成员态真实数据，写方法走匿名请求（只验证鉴权/参数分支，不在生产库产生写入）；
 *              - 业务语义由文末「核心业务断言」补足（登录、会员/免费访问差异、搜索、行业、供应商、支付配置等）；
 *              - SSE 长连接等无法自然结束的端点见 api-coverage.exemptions.json。
 *
 *              新增 / 改名路由必须同步补用例，否则 scripts/gates/check-api-e2e-coverage.mjs 失败。
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const MEMBER = process.env.E2E_VIP_USER ?? "vip@qq.com";
const FREE = process.env.E2E_FREE_USER ?? "free@qq.com";
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? "admin123";
const NOTICE_PK = Number(process.env.E2E_NOTICE_PK ?? 1788410859);

type Auth = "member" | "free" | "none";
type BodyType = "object" | "array" | "jsonnull" | "html" | "text" | "binary";

interface ApiCase {
  method: string;
  path: string;
  auth: Auth;
  /** 精确期望状态码（回归钉） */
  status: number;
  bodyType: BodyType;
  /** 原始端点模板（不含 query） */
  src: string;
}

const CASES: ApiCase[] = [
  { method: "POST", path: "/api/ai/matchmake", auth: "none", status: 401, bodyType: "object", src: "/api/ai/matchmake" },
  { method: "POST", path: "/api/auth/bind-email", auth: "none", status: 401, bodyType: "object", src: "/api/auth/bind-email" },
  { method: "POST", path: "/api/auth/bind-phone", auth: "none", status: 401, bodyType: "object", src: "/api/auth/bind-phone" },
  { method: "POST", path: "/api/auth/forgot-password", auth: "none", status: 400, bodyType: "object", src: "/api/auth/forgot-password" },
  { method: "POST", path: "/api/auth/login", auth: "none", status: 400, bodyType: "object", src: "/api/auth/login" },
  { method: "POST", path: "/api/auth/logout", auth: "none", status: 200, bodyType: "object", src: "/api/auth/logout" },
  { method: "PUT", path: "/api/auth/profile", auth: "none", status: 401, bodyType: "object", src: "/api/auth/profile" },
  { method: "POST", path: "/api/auth/rebind-phone", auth: "none", status: 401, bodyType: "object", src: "/api/auth/rebind-phone" },
  { method: "POST", path: "/api/auth/refresh", auth: "none", status: 400, bodyType: "object", src: "/api/auth/refresh" },
  { method: "POST", path: "/api/auth/register", auth: "none", status: 400, bodyType: "object", src: "/api/auth/register" },
  { method: "POST", path: "/api/auth/reset-password", auth: "none", status: 400, bodyType: "object", src: "/api/auth/reset-password" },
  { method: "POST", path: "/api/auth/send-email-code", auth: "none", status: 401, bodyType: "object", src: "/api/auth/send-email-code" },
  { method: "POST", path: "/api/auth/send-phone-code", auth: "none", status: 401, bodyType: "object", src: "/api/auth/send-phone-code" },
  { method: "POST", path: "/api/auth/send-register-sms-code", auth: "none", status: 400, bodyType: "object", src: "/api/auth/send-register-sms-code" },
  { method: "POST", path: "/api/auth/unbind-email", auth: "none", status: 401, bodyType: "object", src: "/api/auth/unbind-email" },
  { method: "POST", path: "/api/auth/unbind-phone", auth: "none", status: 401, bodyType: "object", src: "/api/auth/unbind-phone" },
  { method: "GET", path: "/api/auth/user", auth: "member", status: 200, bodyType: "object", src: "/api/auth/user" },
  { method: "GET", path: "/api/billing/invoices", auth: "none", status: 401, bodyType: "object", src: "/api/billing/invoices" },
  { method: "POST", path: "/api/billing/invoices", auth: "none", status: 401, bodyType: "object", src: "/api/billing/invoices" },
  { method: "GET", path: "/api/billing/invoices/invoice_1_abc.pdf", auth: "none", status: 401, bodyType: "object", src: "/api/billing/invoices/:filename" },
  { method: "GET", path: "/api/billing/company-search?keyword=x", auth: "none", status: 401, bodyType: "object", src: "/api/billing/company-search" },
  { method: "POST", path: "/api/internal/notifications/invoice", auth: "none", status: 403, bodyType: "object", src: "/api/internal/notifications/invoice" },
  { method: "GET", path: "/api/auth/mfa/status", auth: "none", status: 401, bodyType: "object", src: "/api/auth/mfa/status" },
  { method: "POST", path: "/api/auth/mfa/setup", auth: "none", status: 401, bodyType: "object", src: "/api/auth/mfa/setup" },
  { method: "POST", path: "/api/auth/mfa/enable", auth: "none", status: 401, bodyType: "object", src: "/api/auth/mfa/enable" },
  { method: "POST", path: "/api/auth/mfa/disable", auth: "none", status: 401, bodyType: "object", src: "/api/auth/mfa/disable" },
  { method: "POST", path: "/api/auth/mfa/verify", auth: "none", status: 400, bodyType: "object", src: "/api/auth/mfa/verify" },
  { method: "GET", path: "/api/awards", auth: "none", status: 200, bodyType: "object", src: "/api/awards" },
  { method: "GET", path: "/api/awards/stats", auth: "none", status: 200, bodyType: "object", src: "/api/awards/stats" },
  { method: "GET", path: "/api/awards/top", auth: "none", status: 200, bodyType: "object", src: "/api/awards/top" },
  { method: "GET", path: "/api/catalog/country-name-map", auth: "none", status: 200, bodyType: "object", src: "/api/catalog/country-name-map" },
  { method: "GET", path: "/api/certifications", auth: "none", status: 200, bodyType: "array", src: "/api/certifications" },
  { method: "GET", path: "/api/eco-partners", auth: "none", status: 200, bodyType: "array", src: "/api/eco-partners" },
  { method: "GET", path: "/api/commodity/smart-infer", auth: "none", status: 400, bodyType: "object", src: "/api/commodity/smart-infer" },
  { method: "GET", path: "/api/commodity/tree?parent=", auth: "none", status: 200, bodyType: "array", src: "/api/commodity/tree" },
  { method: "GET", path: "/api/commodity/tree/prefs", auth: "none", status: 200, bodyType: "object", src: "/api/commodity/tree/prefs" },
  { method: "GET", path: "/api/crm/chat/messages", auth: "member", status: 400, bodyType: "object", src: "/api/crm/chat/messages" },
  { method: "POST", path: "/api/crm/chat/messages", auth: "none", status: 401, bodyType: "object", src: "/api/crm/chat/messages" },
  { method: "DELETE", path: "/api/crm/chat/sessions", auth: "none", status: 401, bodyType: "object", src: "/api/crm/chat/sessions" },
  { method: "GET", path: "/api/crm/chat/sessions", auth: "member", status: 200, bodyType: "array", src: "/api/crm/chat/sessions" },
  { method: "POST", path: "/api/crm/chat/sessions", auth: "none", status: 401, bodyType: "object", src: "/api/crm/chat/sessions" },
  { method: "GET", path: "/api/crm/chat/sessions/history", auth: "member", status: 200, bodyType: "object", src: "/api/crm/chat/sessions/history" },
  { method: "GET", path: "/api/crm/chat/sessions/queue", auth: "member", status: 400, bodyType: "object", src: "/api/crm/chat/sessions/queue" },
  { method: "POST", path: "/api/crm/chat/sessions/rate", auth: "none", status: 401, bodyType: "object", src: "/api/crm/chat/sessions/rate" },
  { method: "POST", path: "/api/crm/chat/stream/ticket", auth: "none", status: 401, bodyType: "object", src: "/api/crm/chat/stream/ticket" },
  { method: "POST", path: "/api/crm/chat/upload", auth: "none", status: 401, bodyType: "object", src: "/api/crm/chat/upload" },
  { method: "GET", path: "/api/industries/facets", auth: "none", status: 200, bodyType: "array", src: "/api/industries/facets" },
  { method: "GET", path: "/api/industries/infer", auth: "none", status: 400, bodyType: "object", src: "/api/industries/infer" },
  { method: "GET", path: "/api/industries/tree", auth: "none", status: 400, bodyType: "object", src: "/api/industries/tree" },
  { method: "GET", path: "/api/keyword-groups/official", auth: "member", status: 200, bodyType: "object", src: "/api/keyword-groups/official" },
  { method: "GET", path: "/api/leads", auth: "member", status: 200, bodyType: "array", src: "/api/leads" },
  { method: "POST", path: "/api/leads", auth: "none", status: 401, bodyType: "object", src: "/api/leads" },
  { method: "POST", path: "/api/leads/log", auth: "none", status: 401, bodyType: "object", src: "/api/leads/log" },
  { method: "GET", path: "/api/membership/credits", auth: "member", status: 200, bodyType: "jsonnull", src: "/api/membership/credits" },
  { method: "GET", path: "/api/membership/plans", auth: "member", status: 200, bodyType: "object", src: "/api/membership/plans" },
  { method: "GET", path: "/api/membership/services", auth: "member", status: 200, bodyType: "array", src: "/api/membership/services" },
  { method: "GET", path: "/api/membership/status", auth: "member", status: 200, bodyType: "object", src: "/api/membership/status" },
  { method: "GET", path: "/api/membership/upgrade/preview", auth: "member", status: 400, bodyType: "object", src: "/api/membership/upgrade/preview" },
  { method: "GET", path: "/api/notices/:id/ai-match", auth: "member", status: 200, bodyType: "object", src: "/api/notices/:id/ai-match" },
  { method: "POST", path: "/api/notices/:id/ai-match", auth: "none", status: 401, bodyType: "object", src: "/api/notices/:id/ai-match" },
  { method: "GET", path: "/api/notices/:id/ai-summary", auth: "member", status: 200, bodyType: "object", src: "/api/notices/:id/ai-summary" },
  { method: "POST", path: "/api/notices/:id/ai-summary", auth: "none", status: 401, bodyType: "object", src: "/api/notices/:id/ai-summary" },
  { method: "POST", path: "/api/notices/:id/ai-summary/stream", auth: "none", status: 401, bodyType: "object", src: "/api/notices/:id/ai-summary/stream" },
  { method: "GET", path: "/api/notices/:id/content", auth: "member", status: 200, bodyType: "object", src: "/api/notices/:id/content" },
  { method: "GET", path: "/api/notices/:id/detail", auth: "member", status: 200, bodyType: "object", src: "/api/notices/:id/detail" },
  { method: "POST", path: "/api/notices/:id/favorite", auth: "none", status: 401, bodyType: "object", src: "/api/notices/:id/favorite" },
  { method: "GET", path: "/api/notices/:id/feasibility-report", auth: "member", status: 200, bodyType: "object", src: "/api/notices/:id/feasibility-report" },
  { method: "POST", path: "/api/notices/:id/feasibility-report", auth: "none", status: 401, bodyType: "object", src: "/api/notices/:id/feasibility-report" },
  { method: "GET", path: "/api/notices/:id/feasibility-report/export", auth: "member", status: 404, bodyType: "object", src: "/api/notices/:id/feasibility-report/export" },
  { method: "GET", path: "/api/notices/:id/feasibility-report/history", auth: "member", status: 200, bodyType: "object", src: "/api/notices/:id/feasibility-report/history" },
  { method: "POST", path: "/api/notices/:id/interest", auth: "none", status: 401, bodyType: "object", src: "/api/notices/:id/interest" },
  { method: "GET", path: "/api/notices/:id/preview", auth: "member", status: 200, bodyType: "object", src: "/api/notices/:id/preview" },
  { method: "GET", path: "/api/notices/:id/report", auth: "member", status: 200, bodyType: "binary", src: "/api/notices/:id/report" },
  { method: "GET", path: "/api/notices/:id/report/preview", auth: "member", status: 200, bodyType: "object", src: "/api/notices/:id/report/preview" },
  { method: "GET", path: "/api/notices/:id/similar", auth: "member", status: 200, bodyType: "object", src: "/api/notices/:id/similar" },
  { method: "GET", path: "/api/notices/:id/translation?lang=zh", auth: "member", status: 200, bodyType: "object", src: "/api/notices/:id/translation" },
  { method: "POST", path: "/api/notices/:id/view", auth: "none", status: 401, bodyType: "object", src: "/api/notices/:id/view" },
  { method: "GET", path: "/api/notices/countries", auth: "member", status: 200, bodyType: "array", src: "/api/notices/countries" },
  { method: "GET", path: "/api/markets", auth: "member", status: 200, bodyType: "array", src: "/api/markets" },
  { method: "GET", path: "/api/notices/favorites", auth: "member", status: 200, bodyType: "object", src: "/api/notices/favorites" },
  { method: "GET", path: "/api/notices/favorites/ids", auth: "member", status: 200, bodyType: "object", src: "/api/notices/favorites/ids" },
  { method: "POST", path: "/api/notices/feedback", auth: "none", status: 401, bodyType: "object", src: "/api/notices/feedback" },
  { method: "GET", path: "/api/notices/home-columns", auth: "member", status: 400, bodyType: "object", src: "/api/notices/home-columns" },
  { method: "GET", path: "/api/notices/hot-searches", auth: "member", status: 200, bodyType: "object", src: "/api/notices/hot-searches" },
  { method: "GET", path: "/api/notices/hot-topics", auth: "member", status: 200, bodyType: "object", src: "/api/notices/hot-topics" },
  { method: "GET", path: "/api/notices/proxy", auth: "member", status: 400, bodyType: "object", src: "/api/notices/proxy" },
  { method: "GET", path: "/api/notices/stats", auth: "member", status: 200, bodyType: "object", src: "/api/notices/stats" },
  { method: "GET", path: "/api/notices/unified-search?limit=1", auth: "member", status: 200, bodyType: "object", src: "/api/notices/unified-search" },
  { method: "GET", path: "/api/notifications", auth: "member", status: 200, bodyType: "object", src: "/api/notifications" },
  { method: "POST", path: "/api/notifications", auth: "none", status: 401, bodyType: "object", src: "/api/notifications" },
  { method: "GET", path: "/api/notifications/:id", auth: "member", status: 404, bodyType: "object", src: "/api/notifications/:id" },
  { method: "PATCH", path: "/api/notifications/:id", auth: "none", status: 401, bodyType: "object", src: "/api/notifications/:id" },
  { method: "GET", path: "/api/open/v1/engineering", auth: "none", status: 401, bodyType: "object", src: "/api/open/v1/engineering" },
  { method: "GET", path: "/api/open/v1/engineering/:id", auth: "none", status: 401, bodyType: "object", src: "/api/open/v1/engineering/:id" },
  { method: "GET", path: "/api/opportunities", auth: "member", status: 200, bodyType: "array", src: "/api/opportunities" },
  { method: "GET", path: "/api/opportunities/:id/translation", auth: "member", status: 400, bodyType: "object", src: "/api/opportunities/:id/translation" },
  { method: "POST", path: "/api/opportunities/:id/view", auth: "none", status: 401, bodyType: "object", src: "/api/opportunities/:id/view" },
  { method: "POST", path: "/api/orders", auth: "none", status: 401, bodyType: "object", src: "/api/orders" },
  { method: "GET", path: "/api/payment/access-records", auth: "member", status: 200, bodyType: "object", src: "/api/payment/access-records" },
  { method: "GET", path: "/api/payment/alipay/redirect/:orderNo", auth: "member", status: 404, bodyType: "object", src: "/api/payment/alipay/redirect/:orderNo" },
  { method: "GET", path: "/api/payment/config-status", auth: "member", status: 200, bodyType: "object", src: "/api/payment/config-status" },
  { method: "POST", path: "/api/payment/notify", auth: "none", status: 404, bodyType: "object", src: "/api/payment/notify" },
  { method: "GET", path: "/api/payment/orders", auth: "member", status: 200, bodyType: "object", src: "/api/payment/orders" },
  { method: "POST", path: "/api/payment/orders", auth: "none", status: 401, bodyType: "object", src: "/api/payment/orders" },
  { method: "GET", path: "/api/payment/orders/:orderNo", auth: "member", status: 404, bodyType: "object", src: "/api/payment/orders/:orderNo" },
  { method: "POST", path: "/api/payments/:orderNo/mock-paid", auth: "none", status: 404, bodyType: "object", src: "/api/payments/:orderNo/mock-paid" },
  { method: "GET", path: "/api/procurement/attachment-files/:filename", auth: "member", status: 400, bodyType: "object", src: "/api/procurement/attachment-files/:filename" },
  { method: "POST", path: "/api/procurement/authorization-callback", auth: "none", status: 403, bodyType: "object", src: "/api/procurement/authorization-callback" },
  { method: "GET", path: "/api/procurement/authorization-files/:filename", auth: "member", status: 400, bodyType: "object", src: "/api/procurement/authorization-files/:filename" },
  { method: "GET", path: "/api/procurement/buyer", auth: "member", status: 200, bodyType: "object", src: "/api/procurement/buyer" },
  { method: "PUT", path: "/api/procurement/buyer", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/buyer" },
  { method: "POST", path: "/api/procurement/buyer/auth-doc", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/buyer/auth-doc" },
  { method: "GET", path: "/api/procurement/buyer/auth-doc/:filename", auth: "member", status: 400, bodyType: "object", src: "/api/procurement/buyer/auth-doc/:filename" },
  { method: "POST", path: "/api/procurement/buyer/license-upload", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/buyer/license-upload" },
  { method: "POST", path: "/api/procurement/buyer/verify-callback", auth: "none", status: 403, bodyType: "object", src: "/api/procurement/buyer/verify-callback" },
  { method: "POST", path: "/api/procurement/items/parse", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/items/parse" },
  { method: "GET", path: "/api/procurement/plaza", auth: "member", status: 200, bodyType: "object", src: "/api/procurement/plaza" },
  { method: "GET", path: "/api/procurement/projects", auth: "member", status: 200, bodyType: "object", src: "/api/procurement/projects" },
  { method: "POST", path: "/api/procurement/projects", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects" },
  { method: "GET", path: "/api/procurement/projects/:id", auth: "member", status: 404, bodyType: "object", src: "/api/procurement/projects/:id" },
  { method: "PATCH", path: "/api/procurement/projects/:id", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id" },
  { method: "GET", path: "/api/procurement/projects/:id/attachments", auth: "member", status: 403, bodyType: "object", src: "/api/procurement/projects/:id/attachments" },
  { method: "POST", path: "/api/procurement/projects/:id/attachments", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/attachments" },
  { method: "GET", path: "/api/procurement/projects/:id/authorization", auth: "member", status: 403, bodyType: "object", src: "/api/procurement/projects/:id/authorization" },
  { method: "POST", path: "/api/procurement/projects/:id/authorization", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/authorization" },
  { method: "GET", path: "/api/procurement/projects/:id/award", auth: "member", status: 403, bodyType: "object", src: "/api/procurement/projects/:id/award" },
  { method: "POST", path: "/api/procurement/projects/:id/award", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/award" },
  { method: "GET", path: "/api/procurement/projects/:id/compare", auth: "member", status: 403, bodyType: "object", src: "/api/procurement/projects/:id/compare" },
  { method: "POST", path: "/api/procurement/projects/:id/copy", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/copy" },
  { method: "GET", path: "/api/procurement/projects/:id/responses", auth: "member", status: 403, bodyType: "object", src: "/api/procurement/projects/:id/responses" },
  { method: "POST", path: "/api/procurement/projects/:id/responses", auth: "member", status: 404, bodyType: "object", src: "/api/procurement/projects/:id/responses" },
  { method: "GET", path: "/api/procurement/projects/:id/result", auth: "none", status: 404, bodyType: "object", src: "/api/procurement/projects/:id/result" },
  { method: "PUT", path: "/api/procurement/projects/:id/items", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/items" },
  { method: "POST", path: "/api/procurement/projects/:id/submit", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/submit" },
  { method: "POST", path: "/api/procurement/projects/:id/extend-deadline", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/extend-deadline" },
  { method: "POST", path: "/api/procurement/projects/:id/withdraw", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/withdraw" },
  { method: "GET", path: "/api/procurement/response-files/:filename", auth: "member", status: 400, bodyType: "object", src: "/api/procurement/response-files/:filename" },
  { method: "GET", path: "/api/procurement/responses/:id", auth: "member", status: 404, bodyType: "object", src: "/api/procurement/responses/:id" },
  { method: "PATCH", path: "/api/procurement/responses/:id", auth: "member", status: 404, bodyType: "object", src: "/api/procurement/responses/:id" },
  { method: "DELETE", path: "/api/procurement/responses/:id/files", auth: "member", status: 400, bodyType: "object", src: "/api/procurement/responses/:id/files" },
  { method: "POST", path: "/api/procurement/responses/:id/files", auth: "member", status: 400, bodyType: "object", src: "/api/procurement/responses/:id/files" },
  { method: "POST", path: "/api/procurement/responses/:id/submit", auth: "member", status: 404, bodyType: "object", src: "/api/procurement/responses/:id/submit" },
  { method: "POST", path: "/api/procurement/responses/:id/withdraw", auth: "member", status: 404, bodyType: "object", src: "/api/procurement/responses/:id/withdraw" },
  { method: "POST", path: "/api/procurement/review-callback", auth: "none", status: 403, bodyType: "object", src: "/api/procurement/review-callback" },
  { method: "POST", path: "/api/procurement/review-claim", auth: "none", status: 403, bodyType: "object", src: "/api/procurement/review-claim" },
  { method: "GET", path: "/api/supplier-claims", auth: "member", status: 400, bodyType: "object", src: "/api/supplier-claims" },
  { method: "POST", path: "/api/supplier-claims", auth: "none", status: 401, bodyType: "object", src: "/api/supplier-claims" },
  { method: "POST", path: "/api/supplier-diagnosis", auth: "none", status: 401, bodyType: "object", src: "/api/supplier-diagnosis" },
  { method: "GET", path: "/api/supplier-diagnosis/mine", auth: "member", status: 200, bodyType: "object", src: "/api/supplier-diagnosis/mine" },
  { method: "POST", path: "/api/supplier-diagnosis/guide-event", auth: "none", status: 401, bodyType: "object", src: "/api/supplier-diagnosis/guide-event" },
  { method: "GET", path: "/api/suppliers", auth: "member", status: 200, bodyType: "array", src: "/api/suppliers" },
  { method: "GET", path: "/api/suppliers/:id", auth: "member", status: 200, bodyType: "object", src: "/api/suppliers/:id" },
  { method: "GET", path: "/api/suppliers/:id/contact", auth: "member", status: 200, bodyType: "object", src: "/api/suppliers/:id/contact" },
  { method: "POST", path: "/api/suppliers/:id/inquiry", auth: "none", status: 401, bodyType: "object", src: "/api/suppliers/:id/inquiry" },
  { method: "GET", path: "/api/suppliers/similar", auth: "member", status: 400, bodyType: "object", src: "/api/suppliers/similar" },
  { method: "GET", path: "/api/suppliers/stats", auth: "member", status: 200, bodyType: "object", src: "/api/suppliers/stats" },
  { method: "GET", path: "/api/system/icp", auth: "none", status: 200, bodyType: "object", src: "/api/system/icp" },
  { method: "GET", path: "/api/system/links", auth: "none", status: 200, bodyType: "array", src: "/api/system/links" },
  { method: "GET", path: "/api/system/version", auth: "none", status: 200, bodyType: "object", src: "/api/system/version" },
  { method: "GET", path: "/api/training", auth: "member", status: 410, bodyType: "object", src: "/api/training" },
  { method: "POST", path: "/api/training", auth: "none", status: 410, bodyType: "object", src: "/api/training" },
  { method: "GET", path: "/api/training/landing", auth: "member", status: 200, bodyType: "object", src: "/api/training/landing" },
  { method: "POST", path: "/api/training/orders", auth: "none", status: 401, bodyType: "object", src: "/api/training/orders" },
  { method: "GET", path: "/api/training/orders/:orderNo", auth: "member", status: 404, bodyType: "object", src: "/api/training/orders/:orderNo" },
  { method: "POST", path: "/api/training/orders/:orderNo/mock-paid", auth: "none", status: 404, bodyType: "object", src: "/api/training/orders/:orderNo/mock-paid" },
  { method: "GET", path: "/api/training/orders/:orderNo/participants", auth: "member", status: 404, bodyType: "object", src: "/api/training/orders/:orderNo/participants" },
  { method: "POST", path: "/api/training/register", auth: "none", status: 401, bodyType: "object", src: "/api/training/register" },
  { method: "POST", path: "/api/unsubscribe", auth: "none", status: 400, bodyType: "object", src: "/api/unsubscribe" },
  { method: "GET", path: "/api/user/account-deletion", auth: "none", status: 401, bodyType: "object", src: "/api/user/account-deletion" },
  { method: "POST", path: "/api/user/account-deletion", auth: "none", status: 401, bodyType: "object", src: "/api/user/account-deletion" },
  { method: "POST", path: "/api/user/account-deletion/code", auth: "none", status: 401, bodyType: "object", src: "/api/user/account-deletion/code" },
  { method: "GET", path: "/api/user/enterprise", auth: "member", status: 200, bodyType: "object", src: "/api/user/enterprise" },
  { method: "POST", path: "/api/user/enterprise", auth: "none", status: 401, bodyType: "object", src: "/api/user/enterprise" },
  { method: "PUT", path: "/api/user/enterprise", auth: "none", status: 401, bodyType: "object", src: "/api/user/enterprise" },
  { method: "GET", path: "/api/user/enterprise/capabilities", auth: "member", status: 200, bodyType: "object", src: "/api/user/enterprise/capabilities" },
  { method: "POST", path: "/api/user/enterprise/capabilities", auth: "none", status: 401, bodyType: "object", src: "/api/user/enterprise/capabilities" },
  { method: "DELETE", path: "/api/user/enterprise/capabilities/:id", auth: "none", status: 401, bodyType: "object", src: "/api/user/enterprise/capabilities/:id" },
  { method: "POST", path: "/api/user/enterprise/license-upload", auth: "none", status: 401, bodyType: "object", src: "/api/user/enterprise/license-upload" },
  { method: "GET", path: "/api/user/enterprise/license/:filename", auth: "member", status: 404, bodyType: "object", src: "/api/user/enterprise/license/:filename" },
  { method: "GET", path: "/api/user/enterprise/suggest", auth: "member", status: 400, bodyType: "object", src: "/api/user/enterprise/suggest" },
  { method: "POST", path: "/api/user/enterprise/withdraw", auth: "none", status: 401, bodyType: "object", src: "/api/user/enterprise/withdraw" },
  { method: "GET", path: "/api/user/keyword-groups", auth: "member", status: 200, bodyType: "object", src: "/api/user/keyword-groups" },
  { method: "POST", path: "/api/user/keyword-groups", auth: "none", status: 401, bodyType: "object", src: "/api/user/keyword-groups" },
  { method: "DELETE", path: "/api/user/keyword-groups/:id", auth: "none", status: 401, bodyType: "object", src: "/api/user/keyword-groups/:id" },
  { method: "PATCH", path: "/api/user/keyword-groups/:id", auth: "none", status: 401, bodyType: "object", src: "/api/user/keyword-groups/:id" },
  { method: "GET", path: "/api/user/llm-config", auth: "member", status: 200, bodyType: "object", src: "/api/user/llm-config" },
  { method: "PUT", path: "/api/user/llm-config", auth: "none", status: 401, bodyType: "object", src: "/api/user/llm-config" },
  { method: "POST", path: "/api/user/llm-config/test", auth: "none", status: 401, bodyType: "object", src: "/api/user/llm-config/test" },
  { method: "GET", path: "/api/user/supplier-pool", auth: "member", status: 200, bodyType: "object", src: "/api/user/supplier-pool" },
  { method: "POST", path: "/api/user/supplier-pool", auth: "none", status: 401, bodyType: "object", src: "/api/user/supplier-pool" },
  { method: "DELETE", path: "/api/user/supplier-pool/:id", auth: "none", status: 401, bodyType: "object", src: "/api/user/supplier-pool/:id" },
  { method: "PATCH", path: "/api/user/supplier-pool/:id", auth: "none", status: 401, bodyType: "object", src: "/api/user/supplier-pool/:id" },
  { method: "GET", path: "/api/user/supplier-pool/search", auth: "member", status: 400, bodyType: "object", src: "/api/user/supplier-pool/search" },
  { method: "GET", path: "/api/wechat/jssdk", auth: "none", status: 400, bodyType: "object", src: "/api/wechat/jssdk" },
  // 采购 P1a/P1b/P1c 新增端点：均先 requireUserKeyOrThrow，匿名一律 401
  { method: "GET", path: "/api/procurement/projects/:id/documents", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/documents" },
  { method: "POST", path: "/api/procurement/projects/:id/documents", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/documents" },
  { method: "DELETE", path: "/api/procurement/projects/:id/documents", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/documents" },
  { method: "GET", path: "/api/procurement/projects/:id/evaluations/:responseId", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/evaluations/:responseId" },
  { method: "PUT", path: "/api/procurement/projects/:id/evaluations/:responseId", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/evaluations/:responseId" },
  { method: "GET", path: "/api/procurement/projects/:id/method-decision", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/method-decision" },
  { method: "POST", path: "/api/procurement/projects/:id/method-decision", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/method-decision" },
  { method: "GET", path: "/api/procurement/projects/:id/shortlist", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/shortlist" },
  { method: "POST", path: "/api/procurement/projects/:id/shortlist", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/shortlist" },
  { method: "GET", path: "/api/procurement/projects/:id/tender-config", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/tender-config" },
  { method: "PUT", path: "/api/procurement/projects/:id/tender-config", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/tender-config" },
  { method: "POST", path: "/api/procurement/projects/:id/responses/:responseId/open-financial", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/projects/:id/responses/:responseId/open-financial" },
  { method: "GET", path: "/api/procurement/tender-doc-files/:filename", auth: "none", status: 401, bodyType: "object", src: "/api/procurement/tender-doc-files/:filename" },
];

function resolvePath(template: string): string {
  return template
    .replace(/^\/api\/notices\/:id\//, `/api/notices/${NOTICE_PK}/`)
    .replace(":materialId", "1")
    .replace(":orderNo", "E2E-NONEXISTENT")
    .replace(":filename", "E2E-nonexistent.pdf")
    .replace(":id", "1");
}

const TOKEN_TTL_MS = 90 * 60 * 1000;
const TOKEN_CACHE_DIR = ".playwright-tokens";

/** 登录 token：内存 → 文件缓存 → 重新登录；带有效性校验，避免反复登录触发限流（账号 15min/10） */
async function getToken(request: APIRequestContext, identifier: string): Promise<string> {
  const cacheFile = `${TOKEN_CACHE_DIR}/token-${identifier.replace(/[^a-zA-Z0-9@._-]/g, "_")}.txt`;
  const candidates: string[] = [];
  try {
    const cached = readFileSync(cacheFile, "utf8").trim();
    const [token, ts] = cached.split("|");
    if (token && Date.now() - Number(ts ?? 0) < TOKEN_TTL_MS) candidates.push(token);
  } catch { /* 无缓存 */ }
  for (const token of candidates) {
    const check = await request.get(`${BASE_URL}/api/membership/status`, { headers: { Authorization: `Bearer ${token}` } });
    if (check.status() === 200) return token;
  }
  const res = await request.post(`${BASE_URL}/api/auth/login`, { data: { identifier, password: PASSWORD } });
  expect(res.ok(), `登录失败 ${identifier}: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.token, "登录响应缺少 token").toBeTruthy();
  const token = String(body.token);
  mkdirSync(TOKEN_CACHE_DIR, { recursive: true });
  writeFileSync(cacheFile, `${token}|${Date.now()}`);
  return token;
}

/** 错误信封契约：{ code: number(非0), message: string } */
function expectErrorEnvelope(body: unknown, label: string): void {
  expect(body, `${label}: 4xx/5xx 必须返回 JSON 错误信封`).toBeTruthy();
  expect(typeof (body as { code?: unknown }).code, `${label}: 缺少 code`).toBe("number");
  expect((body as { code: number }).code, `${label}: code 不能为 0`).not.toBe(0);
  expect(typeof (body as { message?: unknown }).message, `${label}: 缺少 message`).toBe("string");
}

/** 成功裸载荷：不得伪装成错误信封 */
function expectBareSuccess(body: unknown, label: string): void {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const hasEnvelope = typeof (body as { code?: unknown }).code === "number" && typeof (body as { message?: unknown }).message === "string";
    expect(hasEnvelope, `${label}: 2xx 不得返回 {code,message} 错误信封`).toBeFalsy();
  }
}

let memberToken = "";
let freeToken = "";

test.beforeAll(async ({ request }) => {
  // 文件级 hook：两个 describe 的用例都能拿到 token；文件缓存避免重复登录触发限流
  memberToken = await getToken(request, MEMBER);
  freeToken = await getToken(request, FREE);
});

test.describe("API 端点全量冒烟（状态码 + 契约）", () => {
  test.describe.configure({ mode: "parallel" });
  test.setTimeout(120_000);

  for (const c of CASES) {
    test(`${c.method} ${c.src}`, async ({ request }) => {
      const headers: Record<string, string> = {};
      const token = c.auth === "member" ? memberToken : c.auth === "free" ? freeToken : "";
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await request.fetch(`${BASE_URL}${resolvePath(c.path)}`, {
        method: c.method,
        headers,
        ...(c.method === "GET" ? {} : { data: {} }),
        timeout: 90_000,
      });
      expect(res.status(), `${c.method} ${c.src}`).toBe(c.status);

      const text = await res.text();
      if (c.status >= 400) {
        let body: unknown;
        try { body = JSON.parse(text); } catch { throw new Error(`${c.method} ${c.src}: 非 JSON 错误响应：${text.slice(0, 120)}`); }
        expectErrorEnvelope(body, `${c.method} ${c.src} (${c.status})`);
        return;
      }

      if (c.bodyType === "binary") {
        expect((res.headers()["content-type"] ?? ""), `${c.method} ${c.src}: 期望文档二进制响应`).not.toContain("application/json");
        expect((await res.body()).length, `${c.method} ${c.src}: 二进制响应为空`).toBeGreaterThan(0);
        return;
      }
      if (c.bodyType === "html") {
        expect(res.headers()["content-type"] ?? "").toContain("text/html");
        expect(text.length, `${c.method} ${c.src}: HTML 报告为空`).toBeGreaterThan(0);
        return;
      }
      if (c.bodyType === "text") {
        expect(typeof text).toBe("string");
        return;
      }
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new Error(`${c.method} ${c.src}: 2xx 非 JSON：${text.slice(0, 120)}`); }
      if (c.bodyType === "array") expect(Array.isArray(body), `${c.method} ${c.src}: 期望数组`).toBeTruthy();
      else if (c.bodyType === "jsonnull") expect(body, `${c.method} ${c.src}: 期望 JSON null`).toBeNull();
      else {
        expect(body && typeof body === "object", `${c.method} ${c.src}: 期望 JSON 对象`).toBeTruthy();
        expect(Object.keys(body as object).length, `${c.method} ${c.src}: 空对象载荷`).toBeGreaterThan(0);
      }
      expectBareSuccess(body, `${c.method} ${c.src}`);
    });
  }
});

test.describe("核心业务断言（访问控制 / 数据契约）", () => {
  test.setTimeout(120_000);

  test("登录成功：返回 token 与用户信息", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, { data: { identifier: MEMBER, password: PASSWORD } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
    expect(body.user?.email).toBe(MEMBER);
    expect(typeof body.user?.hasSubscription).toBe("boolean");
  });

  test("登录失败：401（不可枚举账户）+ 错误信封", async ({ request }) => {
    // 不存在的账户与错误密码同归 401（ADR-0021；403 仅用于停用/未审核账户），
    // 错误密码的 401 由账号限流保护，不在 E2E 反复触发
    const res = await request.post(`${BASE_URL}/api/auth/login`, { data: { identifier: "e2e-no-such-user@example.invalid", password: "definitely-wrong-password" } });
    expect(res.status()).toBe(401);
    expectErrorEnvelope(await res.json(), "登录失败");
  });

  test("会员可读公告详情：reference/title/industry", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/notices/${NOTICE_PK}/detail`, { headers: { Authorization: `Bearer ${memberToken}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.reference).toBeTruthy();
    expect(body.title).toBeTruthy();
    expect(body.industry).toBeTruthy();
  });

  test("免费用户公告详情：核心内容锁定但资质可读（free 档 qualification_access=1）", async ({ request }) => {
    // 产品矩阵（plan_benefits.free）：qualification_access=1、original_file_access=0，
    // 因此 free 用户拿到 200 + coreLocked，而不是 403。
    const res = await request.get(`${BASE_URL}/api/notices/${NOTICE_PK}/detail`, { headers: { Authorization: `Bearer ${freeToken}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.coreLocked).toBe(true);
    expect(body.qualificationAccess).toBe(true);
  });

  test("公告内容接口：description 或原文非空", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/notices/${NOTICE_PK}/content`, { headers: { Authorization: `Bearer ${memberToken}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const text = body.description ?? body.originalDescription ?? "";
    expect(String(text).length, "公告内容为空").toBeGreaterThan(0);
  });

  test("统一搜索：items 数组且可分页", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/notices/unified-search?limit=1`, { headers: { Authorization: `Bearer ${memberToken}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBeTruthy();
    expect(body.items.length).toBeGreaterThan(0);
    expect(typeof body.total).toBe("number");
  });

  test("会员状态：plan/subscription/quotas 契约", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/membership/status`, { headers: { Authorization: `Bearer ${memberToken}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("plan");
    expect(body).toHaveProperty("subscription");
    expect(body).toHaveProperty("quotas");
  });

  test("行业 facets：数组且含 key/nameZh", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/industries/facets`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].key).toBeTruthy();
    expect(body[0].nameZh).toBeTruthy();
  });

  test("供应商列表与详情：名称/行业字段", async ({ request }) => {
    const listRes = await request.get(`${BASE_URL}/api/suppliers?limit=1`);
    expect(listRes.status()).toBe(200);
    const detailRes = await request.get(`${BASE_URL}/api/suppliers/1`);
    expect(detailRes.status()).toBe(200);
    const body = await detailRes.json();
    expect(body.nameZh ?? body.nameEn).toBeTruthy();
    expect(body.industryZh ?? body.industryEn).toBeTruthy();
  });

  test("支付渠道配置：providers 对象", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/payment/config-status`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.providers && typeof body.providers).toBe("object");
    expect(body.providers.alipay).toBeTruthy();
  });

  test("翻译接口缺 lang：400 + 错误信封", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/notices/${NOTICE_PK}/translation`, { headers: { Authorization: `Bearer ${memberToken}` } });
    expect(res.status()).toBe(400);
    expectErrorEnvelope(await res.json(), "翻译缺 lang");
  });
});



