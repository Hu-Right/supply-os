/**
 * POST /api/supplier-qualification 集成测试（P0-1 资源库回填打通）
 * @module tests/integration/api-routes/supplier-qualification.test.ts
 * @description 覆盖：登录态 + poolId → 回写 crm_user_supplier_pool.qualification_id；
 *              无 poolId / 未登录 → 不回写。Mock DB 与 repo/auth，业务分支真实执行。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { insertQualification, linkUserQualification, linkQualification, extractUserKey } = vi.hoisted(() => ({
  insertQualification: vi.fn(),
  linkUserQualification: vi.fn(),
  linkQualification: vi.fn(),
  extractUserKey: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ query: vi.fn(), execute: vi.fn() }) }));
vi.mock("@/lib/db/context", () => ({
  getContext: () => ({ user: { usersRepo: { findByPhone: vi.fn() }, invitationRepo: { findByCode: vi.fn() } } }),
}));
vi.mock("@/lib/middleware/rateLimiter", () => ({ checkRateLimit: () => undefined }));
vi.mock("@/lib/middleware/auth", () => ({ extractUserKey }));
vi.mock("@/lib/repos/supplier-qualification.repo", () => ({
  SupplierQualificationRepo: function (this: any) {
    Object.assign(this, { insertQualification, linkUserQualification });
  },
}));
vi.mock("@/lib/repos/user-supplier-pool.repo", () => ({
  UserSupplierPoolRepo: function (this: any) {
    Object.assign(this, { linkQualification });
  },
}));

const REQUIRED = {
  company_name: "工厂A", industry: ["电子"], main_product: "芯片", export_scale: "100-500万",
  certifications: ["ISO9001"], service_countries: "德,法", overseas_companies: "无",
  ungm_status: "未注册", english_team: "一般", payment_terms: "接受", bid_willingness: "否",
};

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/supplier-qualification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(body: unknown) {
  const { POST } = await import("@/app/api/supplier-qualification/route");
  return POST(postReq(body));
}

beforeEach(() => {
  vi.clearAllMocks();
  insertQualification.mockResolvedValue(555);
  linkUserQualification.mockResolvedValue(undefined);
  linkQualification.mockResolvedValue(undefined);
});

describe("POST /api/supplier-qualification poolId 回写", () => {
  it("登录态 + poolId → 回写资源库 qualification_id", async () => {
    extractUserKey.mockResolvedValue({ userId: 42 });
    const res = await call({ ...REQUIRED, poolId: 7 });
    expect(res.status).toBe(201);
    expect(linkQualification).toHaveBeenCalledWith(42, 7, 555);
  });

  it("无 poolId → 不回写资源库", async () => {
    extractUserKey.mockResolvedValue({ userId: 42 });
    await call({ ...REQUIRED });
    expect(linkQualification).not.toHaveBeenCalled();
  });

  it("有 poolId 但未登录 → 不回写（无法校验归属）", async () => {
    extractUserKey.mockResolvedValue({ userId: null });
    await call({ ...REQUIRED, poolId: 7 });
    expect(linkQualification).not.toHaveBeenCalled();
  });
});
