/**
 * GET /api/membership/credits 路由集成测试（mock getContext + auth）。
 *
 * 这条接口是文档「199 升级年包可全额抵扣」的展示口径：
 * 命中时回一张可抵扣单（金额转 number），没有则回 null —— 不能把 null 渲染成 0 元抵扣。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUsableAnnualPlanCredit = vi.fn();
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({ payment: { paymentsRepo: { findUsableAnnualPlanCredit } } }),
}));
vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn(async () => ({ userId: 123, authViaJwt: true })),
}));

const req = () => new NextRequest("http://localhost:3000/api/membership/credits");

describe("GET /api/membership/credits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("有可用抵扣单 → 返回单号与金额（number）", async () => {
    findUsableAnnualPlanCredit.mockResolvedValue({ order_no: "SV1", amount: "199.00", currency: "CNY" });
    const { GET } = await import("@/app/api/membership/credits/route");
    const res = await GET(req());
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ source_order_no: "SV1", amount: 199, currency: "CNY" });
    expect(findUsableAnnualPlanCredit).toHaveBeenCalledWith(123);
  });

  it("无可用抵扣单 → null（不是 0 元抵扣）", async () => {
    findUsableAnnualPlanCredit.mockResolvedValue(null);
    const { GET } = await import("@/app/api/membership/credits/route");
    expect(await (await GET(req())).json()).toBeNull();
  });

  it("DB 异常 → 500", async () => {
    findUsableAnnualPlanCredit.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/membership/credits/route");
    expect((await GET(req())).status).toBe(500);
  });
});
