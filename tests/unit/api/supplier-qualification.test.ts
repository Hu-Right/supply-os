/**
 * 供应商资格提交路由测试
 * @module tests/unit/api/supplier-qualification.test.ts
 * @description 覆盖：JSON 解析失败、必填字段缺失、正常提交、
 *              phone 关联、邀请码解析、DB 错误降级。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/pool", () => ({ getPool: vi.fn(() => ({})) }));
vi.mock("@/lib/db/context", () => ({ getContext: vi.fn() }));
const mockRepoInstance = {
  insertQualification: vi.fn().mockResolvedValue(42),
  linkUserQualification: vi.fn().mockResolvedValue(undefined),
};
vi.mock("@/lib/repos/supplier-qualification.repo", () => ({
  SupplierQualificationRepo: function (this: any) { Object.assign(this, mockRepoInstance); },
}));
vi.mock("@/lib/middleware/rateLimiter", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/utils/ip", () => ({ extractClientIp: vi.fn(() => "1.2.3.4") }));

import { POST } from "@/app/api/supplier-qualification/route";
import { getContext } from "@/lib/db/context";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/supplier-qualification", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  company_name: "Test Co",
  industry: ["IT"],
  main_product: "Software",
  export_scale: "1M+",
  certifications: ["ISO9001"],
  service_countries: "US",
  overseas_companies: "2",
  ungm_status: "registered",
  english_team: "5+",
  payment_terms: "30d",
  bid_willingness: "yes",
};

describe("POST /api/supplier-qualification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getContext).mockReturnValue({
      user: {
        usersRepo: { findByPhone: vi.fn().mockResolvedValue(null) },
        invitationRepo: { findByCode: vi.fn().mockResolvedValue(null) },
      },
    } as any);
  });

  it("非法 JSON → 400/40000", async () => {
    const res = await POST(makeReq("not-json"));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe(40000);
  });

  it("必填字段缺失（industry） → 400", async () => {
    const res = await POST(makeReq({ company_name: "Test" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("必填项");
  });

  it("必填字段为空数组 → 400", async () => {
    const res = await POST(makeReq({ ...validBody, industry: [] }));
    expect(res.status).toBe(400);
  });

  it("正常提交 → 201 + id + qualification_id", async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe(42);
    expect(body.qualification_id).toBe(42);
  });

  it("带 phone → 关联用户并回写", async () => {
    const linkFn = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getContext).mockReturnValue({
      user: {
        usersRepo: { findByPhone: vi.fn().mockResolvedValue({ id: 7 }) },
        invitationRepo: { findByCode: vi.fn().mockResolvedValue(null) },
      },
    } as any);
    mockRepoInstance.insertQualification = vi.fn().mockResolvedValue(42);
    mockRepoInstance.linkUserQualification = linkFn;
    const res = await POST(makeReq({ ...validBody, phone: "13800000000" }));
    expect(res.status).toBe(201);
    expect(linkFn).toHaveBeenCalledWith(7, 42);
  });

  it("带 invitation_code → 解析推荐员工 ID", async () => {
    vi.mocked(getContext).mockReturnValue({
      user: {
        usersRepo: { findByPhone: vi.fn().mockResolvedValue(null) },
        invitationRepo: { findByCode: vi.fn().mockResolvedValue({ employee_id: 5 }) },
      },
    } as any);
    const res = await POST(makeReq({ ...validBody, invitation_code: "ABC123" }));
    expect(res.status).toBe(201);
  });

  it("phone 查找失败不阻断提交", async () => {
    vi.mocked(getContext).mockReturnValue({
      user: {
        usersRepo: { findByPhone: vi.fn().mockRejectedValue(new Error("db")) },
        invitationRepo: { findByCode: vi.fn().mockResolvedValue(null) },
      },
    } as any);
    const res = await POST(makeReq({ ...validBody, phone: "13800000000" }));
    expect(res.status).toBe(201);
  });

  it("DB 插入失败 → 500/50000", async () => {
    mockRepoInstance.insertQualification = vi.fn().mockRejectedValue(new Error("DB down"));
    mockRepoInstance.linkUserQualification = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe(50000);
  });

  it("source 默认为 qualification", async () => {
    const insertFn = vi.fn().mockResolvedValue(42);
    mockRepoInstance.insertQualification = insertFn;
    mockRepoInstance.linkUserQualification = vi.fn();
    await POST(makeReq(validBody));
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ source: "qualification" }));
  });
});
