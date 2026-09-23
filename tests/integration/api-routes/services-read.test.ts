/** GET /api/membership/services 路由集成测试（mock getContext）。 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const listActiveServices = vi.fn();
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({ benefitSystemRepo: { listActiveServices } }),
}));

describe("GET /api/membership/services", () => {
  beforeEach(() => vi.clearAllMocks());

  it("返回服务目录数组", async () => {
    listActiveServices.mockResolvedValue([{ service_code: "svc_x", standard_price: "199.00" }]);
    const { GET } = await import("@/app/api/membership/services/route");
    const body = await (await GET(new NextRequest("http://localhost:3000/api/membership/services"))).json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].service_code).toBe("svc_x");
  });

  it("空目录返回 []", async () => {
    listActiveServices.mockResolvedValue([]);
    const { GET } = await import("@/app/api/membership/services/route");
    const body = await (await GET(new NextRequest("http://localhost:3000/api/membership/services"))).json();
    expect(body).toEqual([]);
  });

  it("异常 → 500", async () => {
    listActiveServices.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/membership/services/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/membership/services"));
    expect(res.status).toBe(500);
  });
});
