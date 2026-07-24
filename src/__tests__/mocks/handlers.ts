import { http, HttpResponse } from "msw";

/**
 * Default API handlers for MSW
 * 默认 API Mock handlers
 *
 * 这些 handlers 覆盖常见的后端接口，返回合理的默认值。
 * 各测试文件可通过 server.use() 覆盖特定 handler 以测试异常场景。
 */
export const handlers = [
  // ── Auth ──────────────────────────────────────────────
  http.post("/api/auth/login", () =>
    HttpResponse.json({
      user: {
        user_key: "uk_mock",
        email: "test@example.com",
        display_name: "TestUser",
        membership_tier: "free",
      },
    })
  ),

  http.post("/api/auth/register", () =>
    HttpResponse.json({
      user: {
        user_key: "uk_mock_new",
        email: "new@example.com",
        display_name: "NewUser",
        membership_tier: "free",
      },
    })
  ),

  http.get("/api/auth/user", () =>
    HttpResponse.json({
      user: {
        user_key: "uk_mock",
        email: "test@example.com",
        display_name: "TestUser",
        membership_tier: "free",
      },
    })
  ),

  // ── Leads / CRM ───────────────────────────────────────
  http.get("/api/leads", () => HttpResponse.json([])),

  http.get("/api/suppliers/custom", () => HttpResponse.json([])),

  // ── Suppliers ─────────────────────────────────────────
  http.get("/api/suppliers", () => HttpResponse.json([])),

  // ── Procurement ───────────────────────────────────────
  http.get("/api/procurement/notices", () =>
    HttpResponse.json({ notices: [], total: 0 })
  ),

  // ── Training ──────────────────────────────────────────
  http.get("/api/training/certifications", () => HttpResponse.json([])),
  http.get("/api/training/industries", () => HttpResponse.json([])),
  http.get("/api/training/industries/:parentId/sub", () =>
    HttpResponse.json([])
  ),
  http.post("/api/training/register", () =>
    HttpResponse.json({ success: true })
  ),

  // ── Payment ───────────────────────────────────────────
  http.post("/api/payment/create-order", () =>
    HttpResponse.json({ orderId: "mock-order-001", status: "pending" })
  ),

  http.get("/api/payment/status/:orderId", () =>
    HttpResponse.json({ orderId: "mock-order-001", status: "paid" })
  ),
];
