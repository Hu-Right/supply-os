/**
 * POST /api/payment/orders 集成测试
 *
 * @description 覆盖创建支付订单的核心流程：
 *              - 学习资料订单（material_*）
 *              - 打包套餐订单（bundle_*）
 *              - 订单号前缀验证
 *              Mock DB Pool 和支付策略，验证路由逻辑。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock DB Pool
const { poolQuery, poolExecute } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  poolExecute: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({
    execute: poolExecute,
    query: poolQuery,
    getConnection: vi.fn().mockResolvedValue({
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      execute: poolExecute,
      query: poolQuery,
    }),
  }),
}));

// Mock auth middleware
// crm_users.user_key 列退役收尾：AuthResult 已不再包含 userKey 字段
// 同时暴露 requireUserKey 与 requireUserKeyOrThrow（路由实际使用后者）
vi.mock("@/lib/middleware/auth", () => ({
  requireUserKey: vi.fn().mockResolvedValue({ userId: 123, authViaJwt: true }),
  requireUserKeyOrThrow: vi.fn().mockResolvedValue({ userId: 123, authViaJwt: true }),
  extractUserKey: vi.fn().mockResolvedValue({ userId: 123, authViaJwt: true }),
}));

// Mock payment strategies
const mockCreatePaymentUrl = vi.fn().mockResolvedValue({
  pay_url: "/pay/mock",
  qr_code_url: "data:image/png;base64,mock_qr",
});

const mockStrategy = {
  name: "mock",
  createPaymentUrl: mockCreatePaymentUrl,
  queryOrderStatus: vi.fn(),
  verifyCallback: vi.fn(),
};

// Mock context
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    payment: {
      paymentMode: "mock",
      paymentService: {
        hasStrategy: vi.fn().mockReturnValue(true),
        getStrategy: vi.fn().mockReturnValue(mockStrategy),
        registerStrategy: vi.fn(),
        createOrder: vi.fn(),
      },
      learningPaymentService: {
        hasStrategy: vi.fn().mockReturnValue(true),
        getStrategy: vi.fn().mockReturnValue(mockStrategy),
        registerStrategy: vi.fn(),
        createOrder: vi.fn().mockResolvedValue({
          order_no: "LE20260904TEST001",
          provider: "mock",
          amount: 99,
          currency: "CNY",
          pay_url: "/pay/mock",
          qr_code_url: "data:image/png;base64,mock_qr",
          status: "pending",
          created_at: new Date().toISOString(),
        }),
      },
      orchestrator: {
        registerStrategy: vi.fn(),
        getStrategy: vi.fn().mockReturnValue(mockStrategy),
        hasStrategy: vi.fn().mockReturnValue(true),
      },
    },
  }),
}));

// Mock QR code generation
vi.mock("@/lib/payment/qr", () => ({
  toQrDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,generated_qr"),
}));

function createOrderRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/payment/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockResolvedValue([[]]);
  poolExecute.mockResolvedValue([{ affectedRows: 1 }]);
});

describe("POST /api/payment/orders", () => {
  describe("学习资料订单（material_*）", () => {
    it("成功创建学习资料订单", async () => {
      const { POST } = await import("@/app/api/payment/orders/route");
      const req = createOrderRequest({
        plan_code: "material_001",
        provider: "mock",
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.order_no).toMatch(/^LE/);
      expect(body.provider).toBe("mock");
      expect(body.status).toBe("pending");
    });

    it("学习资料订单号以 LE 开头", async () => {
      const { POST } = await import("@/app/api/payment/orders/route");
      const req = createOrderRequest({
        plan_code: "material_001",
        provider: "mock",
      });

      const res = await POST(req);
      const body = await res.json();

      expect(body.order_no).toMatch(/^LE\d{8}/);
    });
  });

  describe("打包套餐订单（bundle_*）", () => {
    it("成功创建打包套餐订单", async () => {
      const { POST } = await import("@/app/api/payment/orders/route");
      const req = createOrderRequest({
        plan_code: "bundle_premium",
        provider: "mock",
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.order_no).toMatch(/^LE/);
    });
  });

  describe("订单响应格式", () => {
    it("返回包含必要字段", async () => {
      const { POST } = await import("@/app/api/payment/orders/route");
      const req = createOrderRequest({
        plan_code: "material_001",
        provider: "mock",
      });

      const res = await POST(req);
      const body = await res.json();

      expect(body).toHaveProperty("order_no");
      expect(body).toHaveProperty("provider");
      expect(body).toHaveProperty("amount");
      expect(body).toHaveProperty("currency");
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("pay_url");
      expect(body).toHaveProperty("qr_code_url");
    });

    it("mock 模式下 payment_mode 为 mock", async () => {
      const { POST } = await import("@/app/api/payment/orders/route");
      const req = createOrderRequest({
        plan_code: "material_001",
        provider: "mock",
      });

      const res = await POST(req);
      const body = await res.json();

      expect(body.payment_mode).toBe("mock");
    });
  });
});
