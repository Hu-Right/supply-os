/**
 * POST /api/user/enterprise — 账号侧排他守卫测试
 * @module tests/unit/api/user/enterprise-post-binding-guard.test.ts
 * @description 钉住「一个账号同一时间只绑一家企业」的服务端口径（此前只由前端
 *              `enterprise.bound ? PUT : POST` 隐式保证）。分状态（路线三）：
 *              1. 旧绑定尚未拿下认证（审核中/认领待核）→ 先显式撤回旧绑定（解绑 + 作废旧
 *                 认领），再为新主体建档/绑定——旧行为是静默覆盖，会抛下审核中的原主体；
 *              2. 旧绑定已认证 → 400，不建档也不换绑，并阻止把已认证企业误导向「认领自己」；
 *              3. 已绑定账号 POST 的正是自己绑定的行 → 放行（等价重复保存资料）；
 *              4. 未绑定账号命中已认证行 → claimRequired，全新主体 → 建档+绑定（均不变）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { poolExecute } = vi.hoisted(() => ({ poolExecute: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ execute: poolExecute }) }));

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
    poolExecute.mockResolvedValue([{ affectedRows: 1 }]);
    vi.mocked(requireUserKeyOrThrow).mockResolvedValue({ userId: 42, authViaJwt: true });
  });

  it("旧绑定仍在审核中：POST 另一家企业 → 先显式撤回旧绑定，再建档绑定", async () => {
    const { ctx, directoryRepo, usersRepo } = buildCtx(bindSubject({ verify_status: "pending" }));
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await POST(postReq({ company: "上海新主体有限公司", credit_code: "91310000XXXXXXXXXX" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ supplierId: 777, reused: false });
    expect(poolExecute.mock.calls[0][0]).toContain("supplier_id = NULL");
    expect(poolExecute.mock.calls[0][1]).toEqual([42, 100]);
    expect(directoryRepo.insertEnterprise).toHaveBeenCalledTimes(1);
    expect(usersRepo.bindSupplier).toHaveBeenCalledWith(42, 777, "verified");
  });

  it("已绑定且已认证：POST 另一家企业 → 400，一行数据都不写", async () => {
    const { ctx, directoryRepo, usersRepo } = buildCtx(bindSubject({ verify_status: "done" }));
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await POST(postReq({ company: "上海新主体有限公司" }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("已认证");
    expect(directoryRepo.insertEnterprise).not.toHaveBeenCalled();
    expect(usersRepo.bindSupplier).not.toHaveBeenCalled();
    expect(poolExecute).not.toHaveBeenCalled();
  });

  it("旧绑定是认领待核（verify_status 为空、claim_status=pending）→ 同样可切换", async () => {
    const { ctx, usersRepo } = buildCtx(bindSubject({ verify_status: null, claim_status: "pending" }));
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await POST(postReq({ company: "上海新主体有限公司" }));
    expect(res.status).toBe(200);
    expect(usersRepo.bindSupplier).toHaveBeenCalledWith(42, 777, "verified");
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
