/**
 * POST /api/user/enterprise — 账号侧排他守卫测试
 * @module tests/unit/api/user/enterprise-post-binding-guard.test.ts
 * @description 钉住「一个账号同一时间只绑一家企业」的服务端口径（此前只由前端
 *              `enterprise.bound ? PUT : POST` 隐式保证）：
 *              1. 已绑定（审核中/已认证）账号 POST 另一家企业 → 400，不建档、不换绑；
 *              2. 已绑定账号 POST 的正是自己绑定的行 → 放行（等价于重复保存资料）；
 *              3. 未绑定账号命中已认证行 → claimRequired（转认领，不变）；
 *              4. 未绑定账号全新主体 → 建档 + 绑定（不变）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/context", () => ({ getContext: vi.fn() }));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: vi.fn() }));
vi.mock("@/lib/services/file-upload", () => ({ deleteFile: vi.fn() }));

import { POST } from "@/app/api/user/enterprise/route";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";

const bindSubject = (over: Record<string, unknown>) => ({
  id: 100,
  company: "杭州原绑定企业有限公司",
  verify_status: "pending",
  claim_status: null,
  ...over,
});

function buildCtx(boundSubjectRow: Record<string, unknown> | null) {
  const directoryRepo = {
    findBoundSubjectByUserId: vi.fn().mockResolvedValue(boundSubjectRow),
    findByCreditCode: vi.fn().mockResolvedValue(null),
    findByCompanyBest: vi.fn().mockResolvedValue(null),
    getClaimOwnership: vi.fn().mockResolvedValue({
      selfBound: false,
      boundByOther: false,
      claimPending: false,
    }),
    insertEnterprise: vi.fn().mockResolvedValue(777),
    updateLicenseUrl: vi.fn(),
    findFullById: vi.fn().mockResolvedValue(null),
  };
  const usersRepo = {
    findProfileById: vi.fn().mockResolvedValue({ id: 42, supplier_id: 100, supplier_link_status: "verified" }),
    bindSupplier: vi.fn().mockResolvedValue(undefined),
  };
  return { ctx: { user: { usersRepo }, supplier: { directoryRepo } }, directoryRepo, usersRepo };
}

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/user/enterprise", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/user/enterprise 账号侧排他", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUserKeyOrThrow).mockResolvedValue({ userId: 42, authViaJwt: true });
  });

  it("已绑定且审核中：POST 另一家企业 → 400，不建档也不换绑", async () => {
    const { ctx, directoryRepo, usersRepo } = buildCtx(bindSubject({ verify_status: "pending" }));
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await POST(postReq({ company: "上海新主体有限公司", credit_code: "91310000XXXXXXXXXX" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("审核中");
    expect(json.message).toContain("一个账号只能认证一家企业");
    expect(directoryRepo.insertEnterprise).not.toHaveBeenCalled();
    expect(usersRepo.bindSupplier).not.toHaveBeenCalled();
  });

  it("已绑定且已认证：POST 另一家企业 → 400", async () => {
    const { ctx, directoryRepo, usersRepo } = buildCtx(bindSubject({ verify_status: "done" }));
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await POST(postReq({ company: "上海新主体有限公司" }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("已认证");
    expect(directoryRepo.insertEnterprise).not.toHaveBeenCalled();
    expect(usersRepo.bindSupplier).not.toHaveBeenCalled();
  });

  it("已绑定且认领审核中（verify_status 为空、claim_status=pending）→ 400 审核中文案", async () => {
    const { ctx, directoryRepo } = buildCtx(bindSubject({ verify_status: null, claim_status: "pending" }));
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await POST(postReq({ company: "上海新主体有限公司" }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("审核中");
    expect(directoryRepo.insertEnterprise).not.toHaveBeenCalled();
  });

  it("已绑定账号重复提交自己绑定的行（未认证）→ 放行并保持原绑定", async () => {
    const { ctx, directoryRepo, usersRepo } = buildCtx(bindSubject({ verify_status: null }));
    vi.mocked(getContext).mockReturnValue(ctx as never);
    directoryRepo.findByCompanyBest.mockResolvedValue({ id: 100, verify_status: null } as never);
    directoryRepo.getClaimOwnership.mockResolvedValue({
      selfBound: true,
      boundByOther: false,
      claimPending: false,
    } as never);

    const res = await POST(postReq({ company: "杭州原绑定企业有限公司" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ supplierId: 100, reused: true });
    expect(usersRepo.bindSupplier).toHaveBeenCalledWith(42, 100, "verified");
    expect(directoryRepo.insertEnterprise).not.toHaveBeenCalled();
  });

  it("未绑定账号命中已认证行 → claimRequired（转认领，不变）", async () => {
    const { ctx, directoryRepo } = buildCtx(null);
    vi.mocked(getContext).mockReturnValue(ctx as never);
    directoryRepo.findByCompanyBest.mockResolvedValue({ id: 555, verify_status: "done" } as never);

    const res = await POST(postReq({ company: "北京已认证企业有限公司" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ supplierId: 555, claimRequired: true });
  });

  it("未绑定账号全新主体 → 建档并绑定（不变）", async () => {
    const { ctx, usersRepo } = buildCtx(null);
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await POST(postReq({ company: "广州全新主体有限公司" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ supplierId: 777, reused: false });
    expect(usersRepo.bindSupplier).toHaveBeenCalledWith(42, 777, "verified");
  });
});
