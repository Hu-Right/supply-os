/**
 * API 端点全量冒烟 E2E（自动填充，禁止手改路径清单）
 *
 * @description 覆盖 src/app/api 下全部 route.ts 的每个 HTTP 方法：
 *              - GET：成员态请求（关键端点严格断言 200/403）；
 *              - 写方法（POST/PUT/PATCH/DELETE）：匿名请求，只验证路由存在与参数/鉴权分支，
 *                不携带有效凭证，避免在生产库产生写入；
 *              - SSE 长连接等无法在 API 冒烟中自然结束的端点在
 *                tests/e2e/api-coverage.exemptions.json 中声明豁免。
 *              端点清单由 scripts/gates/check-api-e2e-coverage.mjs 校验，新增路由必须同步补用例。
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const MEMBER = process.env.E2E_VIP_USER ?? "vip@qq.com";
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? "admin123";
const NOTICE_PK = Number(process.env.E2E_NOTICE_PK ?? 1788410859);

type Auth = "member" | "none";

interface ApiCase {
  method: string;
  path: string;
  auth: Auth;
  expect: number[];
  /** 原始端点模板（不含 query） */
  src: string;
}

const CASES: ApiCase[] = [
  { method: "POST", path: "/api/ai/matchmake", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/ai/matchmake" },
  { method: "POST", path: "/api/auth/bind-email", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/bind-email" },
  { method: "POST", path: "/api/auth/bind-phone", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/bind-phone" },
  { method: "POST", path: "/api/auth/forgot-password", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/forgot-password" },
  { method: "POST", path: "/api/auth/login", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/login" },
  { method: "POST", path: "/api/auth/logout", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/logout" },
  { method: "PUT", path: "/api/auth/profile", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/profile" },
  { method: "POST", path: "/api/auth/rebind-phone", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/rebind-phone" },
  { method: "POST", path: "/api/auth/refresh", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/refresh" },
  { method: "POST", path: "/api/auth/register", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/register" },
  { method: "POST", path: "/api/auth/reset-password", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/reset-password" },
  { method: "POST", path: "/api/auth/send-email-code", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/send-email-code" },
  { method: "POST", path: "/api/auth/send-phone-code", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/send-phone-code" },
  { method: "POST", path: "/api/auth/send-register-sms-code", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/send-register-sms-code" },
  { method: "POST", path: "/api/auth/unbind-email", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/unbind-email" },
  { method: "POST", path: "/api/auth/unbind-phone", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/auth/unbind-phone" },
  { method: "GET", path: "/api/auth/user", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/auth/user" },
  { method: "GET", path: "/api/awards", auth: "none", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/awards" },
  { method: "GET", path: "/api/awards/stats", auth: "none", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/awards/stats" },
  { method: "GET", path: "/api/awards/top", auth: "none", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/awards/top" },
  { method: "GET", path: "/api/catalog/country-name-map", auth: "none", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/catalog/country-name-map" },
  { method: "GET", path: "/api/certifications", auth: "none", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/certifications" },
  { method: "GET", path: "/api/commodity/smart-infer", auth: "none", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/commodity/smart-infer" },
  { method: "GET", path: "/api/commodity/tree?parent=", auth: "none", expect: [200], src: "/api/commodity/tree" },
  { method: "GET", path: "/api/commodity/tree/prefs", auth: "none", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/commodity/tree/prefs" },
  { method: "GET", path: "/api/crm/chat/messages", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/crm/chat/messages" },
  { method: "POST", path: "/api/crm/chat/messages", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/crm/chat/messages" },
  { method: "DELETE", path: "/api/crm/chat/sessions", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/crm/chat/sessions" },
  { method: "GET", path: "/api/crm/chat/sessions", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/crm/chat/sessions" },
  { method: "POST", path: "/api/crm/chat/sessions", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/crm/chat/sessions" },
  { method: "GET", path: "/api/crm/chat/sessions/history", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/crm/chat/sessions/history" },
  { method: "GET", path: "/api/crm/chat/sessions/queue", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/crm/chat/sessions/queue" },
  { method: "POST", path: "/api/crm/chat/sessions/rate", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/crm/chat/sessions/rate" },
  { method: "POST", path: "/api/crm/chat/stream/ticket", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/crm/chat/stream/ticket" },
  { method: "POST", path: "/api/crm/chat/upload", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/crm/chat/upload" },
  { method: "GET", path: "/api/industries/facets", auth: "none", expect: [200], src: "/api/industries/facets" },
  { method: "GET", path: "/api/industries/tree", auth: "none", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/industries/tree" },
  { method: "GET", path: "/api/keyword-groups/official", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/keyword-groups/official" },
  { method: "GET", path: "/api/leads", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/leads" },
  { method: "POST", path: "/api/leads", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/leads" },
  { method: "POST", path: "/api/leads/log", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/leads/log" },
  { method: "GET", path: "/api/learning/bundles", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/learning/bundles" },
  { method: "GET", path: "/api/learning/materials", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/learning/materials" },
  { method: "GET", path: "/api/learning/materials/:materialId/content", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/learning/materials/:materialId/content" },
  { method: "GET", path: "/api/learning/purchased", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/learning/purchased" },
  { method: "GET", path: "/api/membership/credits", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/membership/credits" },
  { method: "GET", path: "/api/membership/plans", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/membership/plans" },
  { method: "GET", path: "/api/membership/services", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/membership/services" },
  { method: "GET", path: "/api/membership/status", auth: "member", expect: [200], src: "/api/membership/status" },
  { method: "GET", path: "/api/membership/upgrade/preview", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/membership/upgrade/preview" },
  { method: "POST", path: "/api/notices/:id/access", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/notices/:id/access" },
  { method: "GET", path: "/api/notices/:id/ai-match", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/:id/ai-match" },
  { method: "POST", path: "/api/notices/:id/ai-match", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/notices/:id/ai-match" },
  { method: "GET", path: "/api/notices/:id/ai-summary", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/:id/ai-summary" },
  { method: "POST", path: "/api/notices/:id/ai-summary", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/notices/:id/ai-summary" },
  { method: "POST", path: "/api/notices/:id/ai-summary/stream", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/notices/:id/ai-summary/stream" },
  { method: "GET", path: "/api/notices/:id/content", auth: "member", expect: [200], src: "/api/notices/:id/content" },
  { method: "GET", path: "/api/notices/:id/detail", auth: "member", expect: [200], src: "/api/notices/:id/detail" },
  { method: "POST", path: "/api/notices/:id/favorite", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/notices/:id/favorite" },
  { method: "GET", path: "/api/notices/:id/feasibility-report", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/:id/feasibility-report" },
  { method: "POST", path: "/api/notices/:id/feasibility-report", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/notices/:id/feasibility-report" },
  { method: "GET", path: "/api/notices/:id/feasibility-report/export", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/:id/feasibility-report/export" },
  { method: "GET", path: "/api/notices/:id/feasibility-report/history", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/:id/feasibility-report/history" },
  { method: "POST", path: "/api/notices/:id/interest", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/notices/:id/interest" },
  { method: "GET", path: "/api/notices/:id/preview", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/:id/preview" },
  { method: "GET", path: "/api/notices/:id/report", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/:id/report" },
  { method: "GET", path: "/api/notices/:id/report/preview", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/:id/report/preview" },
  { method: "GET", path: "/api/notices/:id/similar", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/:id/similar" },
  { method: "GET", path: "/api/notices/:id/translation?lang=zh", auth: "member", expect: [200, 400, 403], src: "/api/notices/:id/translation" },
  { method: "POST", path: "/api/notices/:id/unlock", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/notices/:id/unlock" },
  { method: "POST", path: "/api/notices/:id/view", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/notices/:id/view" },
  { method: "GET", path: "/api/notices/access-ids", auth: "member", expect: [200], src: "/api/notices/access-ids" },
  { method: "GET", path: "/api/notices/countries", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/countries" },
  { method: "GET", path: "/api/notices/favorites", auth: "member", expect: [200], src: "/api/notices/favorites" },
  { method: "GET", path: "/api/notices/favorites/ids", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/favorites/ids" },
  { method: "POST", path: "/api/notices/feedback", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/notices/feedback" },
  { method: "GET", path: "/api/notices/home-columns", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/home-columns" },
  { method: "GET", path: "/api/notices/hot-searches", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/hot-searches" },
  { method: "GET", path: "/api/notices/hot-topics", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/hot-topics" },
  { method: "GET", path: "/api/notices/proxy", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/proxy" },
  { method: "GET", path: "/api/notices/stats", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/stats" },
  { method: "GET", path: "/api/notices/unified-search?limit=1", auth: "member", expect: [200], src: "/api/notices/unified-search" },
  { method: "GET", path: "/api/notices/unlocks", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notices/unlocks" },
  { method: "GET", path: "/api/notifications", auth: "member", expect: [200], src: "/api/notifications" },
  { method: "POST", path: "/api/notifications", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/notifications" },
  { method: "GET", path: "/api/notifications/:id", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/notifications/:id" },
  { method: "PATCH", path: "/api/notifications/:id", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/notifications/:id" },
  { method: "GET", path: "/api/open/v1/engineering", auth: "none", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/open/v1/engineering" },
  { method: "GET", path: "/api/open/v1/engineering/:id", auth: "none", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/open/v1/engineering/:id" },
  { method: "GET", path: "/api/opportunities", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/opportunities" },
  { method: "POST", path: "/api/opportunities/:id/access", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/opportunities/:id/access" },
  { method: "GET", path: "/api/opportunities/:id/translation", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/opportunities/:id/translation" },
  { method: "POST", path: "/api/opportunities/:id/unlock", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/opportunities/:id/unlock" },
  { method: "POST", path: "/api/opportunities/:id/view", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/opportunities/:id/view" },
  { method: "GET", path: "/api/opportunities/access-ids", auth: "member", expect: [200], src: "/api/opportunities/access-ids" },
  { method: "GET", path: "/api/opportunities/unlocks", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/opportunities/unlocks" },
  { method: "POST", path: "/api/orders", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/orders" },
  { method: "GET", path: "/api/payment/access-records", auth: "member", expect: [200], src: "/api/payment/access-records" },
  { method: "GET", path: "/api/payment/alipay/redirect/:orderNo", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/payment/alipay/redirect/:orderNo" },
  { method: "GET", path: "/api/payment/config-status", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/payment/config-status" },
  { method: "POST", path: "/api/payment/notify", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/payment/notify" },
  { method: "GET", path: "/api/payment/orders", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/payment/orders" },
  { method: "POST", path: "/api/payment/orders", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/payment/orders" },
  { method: "GET", path: "/api/payment/orders/:orderNo", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/payment/orders/:orderNo" },
  { method: "GET", path: "/api/payment/unlocks", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/payment/unlocks" },
  { method: "POST", path: "/api/payments/:orderNo/mock-paid", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/payments/:orderNo/mock-paid" },
  { method: "GET", path: "/api/procurement/attachment-files/:filename", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/procurement/attachment-files/:filename" },
  { method: "POST", path: "/api/procurement/authorization-callback", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/authorization-callback" },
  { method: "GET", path: "/api/procurement/authorization-files/:filename", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/procurement/authorization-files/:filename" },
  { method: "GET", path: "/api/procurement/buyer", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/procurement/buyer" },
  { method: "PUT", path: "/api/procurement/buyer", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/buyer" },
  { method: "POST", path: "/api/procurement/buyer/auth-doc", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/buyer/auth-doc" },
  { method: "GET", path: "/api/procurement/buyer/auth-doc/:filename", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/procurement/buyer/auth-doc/:filename" },
  { method: "POST", path: "/api/procurement/buyer/license-upload", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/buyer/license-upload" },
  { method: "POST", path: "/api/procurement/buyer/verify-callback", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/buyer/verify-callback" },
  { method: "POST", path: "/api/procurement/items/parse", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/items/parse" },
  { method: "GET", path: "/api/procurement/plaza", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/procurement/plaza" },
  { method: "GET", path: "/api/procurement/projects", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/procurement/projects" },
  { method: "POST", path: "/api/procurement/projects", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/projects" },
  { method: "GET", path: "/api/procurement/projects/:id", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/procurement/projects/:id" },
  { method: "PATCH", path: "/api/procurement/projects/:id", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/projects/:id" },
  { method: "GET", path: "/api/procurement/projects/:id/attachments", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/procurement/projects/:id/attachments" },
  { method: "POST", path: "/api/procurement/projects/:id/attachments", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/projects/:id/attachments" },
  { method: "GET", path: "/api/procurement/projects/:id/authorization", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/procurement/projects/:id/authorization" },
  { method: "POST", path: "/api/procurement/projects/:id/authorization", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/projects/:id/authorization" },
  { method: "POST", path: "/api/procurement/projects/:id/copy", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/projects/:id/copy" },
  { method: "PUT", path: "/api/procurement/projects/:id/items", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/projects/:id/items" },
  { method: "POST", path: "/api/procurement/projects/:id/submit", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/projects/:id/submit" },
  { method: "POST", path: "/api/procurement/projects/:id/withdraw", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/projects/:id/withdraw" },
  { method: "POST", path: "/api/procurement/review-callback", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/review-callback" },
  { method: "POST", path: "/api/procurement/review-claim", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/procurement/review-claim" },
  { method: "GET", path: "/api/supplier-claims", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/supplier-claims" },
  { method: "POST", path: "/api/supplier-claims", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/supplier-claims" },
  { method: "POST", path: "/api/supplier-diagnosis", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/supplier-diagnosis" },
  { method: "GET", path: "/api/supplier-diagnosis/mine", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/supplier-diagnosis/mine" },
  { method: "GET", path: "/api/suppliers", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/suppliers" },
  { method: "GET", path: "/api/suppliers/:id", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/suppliers/:id" },
  { method: "GET", path: "/api/suppliers/:id/contact", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/suppliers/:id/contact" },
  { method: "GET", path: "/api/suppliers/similar", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/suppliers/similar" },
  { method: "GET", path: "/api/suppliers/stats", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/suppliers/stats" },
  { method: "GET", path: "/api/system/icp", auth: "none", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/system/icp" },
  { method: "GET", path: "/api/system/links", auth: "none", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/system/links" },
  { method: "GET", path: "/api/system/version", auth: "none", expect: [200], src: "/api/system/version" },
  { method: "GET", path: "/api/training", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/training" },
  { method: "POST", path: "/api/training", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/training" },
  { method: "POST", path: "/api/training/downloads/track", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/training/downloads/track" },
  { method: "GET", path: "/api/training/landing", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/training/landing" },
  { method: "POST", path: "/api/training/orders", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/training/orders" },
  { method: "GET", path: "/api/training/orders/:orderNo", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/training/orders/:orderNo" },
  { method: "POST", path: "/api/training/orders/:orderNo/mock-paid", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/training/orders/:orderNo/mock-paid" },
  { method: "GET", path: "/api/training/orders/:orderNo/participants", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/training/orders/:orderNo/participants" },
  { method: "POST", path: "/api/training/register", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/training/register" },
  { method: "POST", path: "/api/unsubscribe", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/unsubscribe" },
  { method: "GET", path: "/api/user/enterprise", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/user/enterprise" },
  { method: "POST", path: "/api/user/enterprise", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/enterprise" },
  { method: "PUT", path: "/api/user/enterprise", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/enterprise" },
  { method: "GET", path: "/api/user/enterprise/capabilities", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/user/enterprise/capabilities" },
  { method: "POST", path: "/api/user/enterprise/capabilities", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/enterprise/capabilities" },
  { method: "DELETE", path: "/api/user/enterprise/capabilities/:id", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/enterprise/capabilities/:id" },
  { method: "GET", path: "/api/user/enterprise/evidence", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/user/enterprise/evidence" },
  { method: "POST", path: "/api/user/enterprise/evidence", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/enterprise/evidence" },
  { method: "DELETE", path: "/api/user/enterprise/evidence/:id", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/enterprise/evidence/:id" },
  { method: "POST", path: "/api/user/enterprise/license-upload", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/enterprise/license-upload" },
  { method: "GET", path: "/api/user/enterprise/license/:filename", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/user/enterprise/license/:filename" },
  { method: "GET", path: "/api/user/enterprise/suggest", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/user/enterprise/suggest" },
  { method: "POST", path: "/api/user/enterprise/withdraw", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/enterprise/withdraw" },
  { method: "GET", path: "/api/user/keyword-groups", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/user/keyword-groups" },
  { method: "POST", path: "/api/user/keyword-groups", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/keyword-groups" },
  { method: "DELETE", path: "/api/user/keyword-groups/:id", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/keyword-groups/:id" },
  { method: "PATCH", path: "/api/user/keyword-groups/:id", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/keyword-groups/:id" },
  { method: "GET", path: "/api/user/llm-config", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/user/llm-config" },
  { method: "PUT", path: "/api/user/llm-config", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/llm-config" },
  { method: "POST", path: "/api/user/llm-config/test", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/llm-config/test" },
  { method: "GET", path: "/api/user/supplier-pool", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/user/supplier-pool" },
  { method: "POST", path: "/api/user/supplier-pool", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/supplier-pool" },
  { method: "DELETE", path: "/api/user/supplier-pool/:id", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/supplier-pool/:id" },
  { method: "PATCH", path: "/api/user/supplier-pool/:id", auth: "none", expect: [200, 201, 202, 204, 400, 401, 402, 403, 404, 405, 409, 410, 413, 415, 422], src: "/api/user/supplier-pool/:id" },
  { method: "GET", path: "/api/user/supplier-pool/search", auth: "member", expect: [200, 400, 401, 403, 404, 405, 409, 410, 422], src: "/api/user/supplier-pool/search" },
];

/** 动态段替换：notice 详情类用真实公告 pk；其余统一用不存在的测试 id（预期 404/400，不产生写入） */
function resolvePath(template: string): string {
  return template
    .replace(/^\/api\/notices\/:id\//, `/api/notices/${NOTICE_PK}/`)
    .replace(":materialId", "1")
    .replace(":orderNo", "E2E-NONEXISTENT")
    .replace(":filename", "E2E-nonexistent.pdf")
    .replace(":id", "1");
}

async function loginToken(request: APIRequestContext, identifier: string): Promise<string> {
  const res = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { identifier, password: PASSWORD },
  });
  expect(res.ok(), `登录失败 ${identifier}: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.token, "登录响应缺少 token").toBeTruthy();
  return String(body.token);
}

let memberToken = "";

test.describe("API 端点全量冒烟", () => {
  // 并行执行：单端点失败不会阻断其余端点（首轮曾因 serial + 一个慢端点导致 99 条未跑）
  test.describe.configure({ mode: "parallel" });
  test.setTimeout(90_000);
  test.beforeAll(async ({ request }) => {
    memberToken = await loginToken(request, MEMBER);
  });

  for (const c of CASES) {
    test(`${c.method} ${c.src}`, async ({ request }) => {
      const headers: Record<string, string> = {};
      if (c.auth === "member") headers.Authorization = `Bearer ${memberToken}`;
      const res = await request.fetch(`${BASE_URL}${resolvePath(c.path)}`, {
        method: c.method,
        headers,
        ...(c.method === "GET" ? {} : { data: {} }),
        timeout: 60_000,
      });
      expect(res.status(), `${c.method} ${c.src} 不应出现 5xx`).toBeLessThan(500);
      expect(c.expect, `${c.method} ${c.src} 实际状态 ${res.status()} 不在允许集合`).toContain(res.status());
    });
  }
});

