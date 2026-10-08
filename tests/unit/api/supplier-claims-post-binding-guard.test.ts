/**
 * POST /api/supplier-claims — 账号侧排他守卫测试
 * @module tests/unit/api/supplier-claims-post-binding-guard.test.ts
 * @description 认领排他此前只查「主体侧」（这家供应商是不是已被绑定/认领中），从不查
 *              「账号侧」（当前账号是不是已经绑定了另一家企业）。由于 createClaimWithBinding
 *              会无条件 UPDATE crm_users.supplier_id，已绑定 A 的账号认领 B 会静默把绑定
 *              从 A 搬到 B（审核中的 A 被抛下、已认证的 A 被顶掉）。本测试钉住新口径（路线三）：
 *              1. 已认证账号认领另一家 → 400，不建认领、不换绑；
 *              2. 旧绑定尚未拿下认证（审核中）→ 先显式撤回旧绑定再建认领，不静默覆盖；
 *              3. 已绑定同一主体 → 沿用「您已绑定该企业，无需重复认领」；
 *              4. 主体侧排他（他人已绑定 / 认领处理中）与全新认领成功路径不变。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { poolExecute } = vi.hoisted(() => ({ poolExecute: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ execute: poolExecute }) }));

vi.mock("@/lib/db/context", () => ({ getContext: vi.fn() }));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: vi.fn() }));
vi.mock("@/lib/middleware/rateLimiter", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/services/supplier-claim", () => ({
  createClaimWithBinding: vi.fn().mockResolvedValue({ claimId: 9001, expiresAt: "2026-10-07 00:00:00" }),
  releaseExpiredClaims: vi.fn(),
}));

import { POST } from "@/app/api/supplier-claims/route";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { createClaimWithBinding } from "@/lib/services/supplier-claim";

const LICENSE_URL = "/api/user/enterprise/license/license_abc123.jpg";

function buildCtx(boundSubjectRow: Record<string, unknown> | null, ownership: Record<string, boolean>) {
  const directoryRepo = {
    findById: vi.fn().mockResolvedValue({ id: 200, company: "目标认领企业有限公司" }),
    findBoundSubjectByUserId: vi.fn().mockResolvedValue(boundSubjectRow),
    getClaimOwnership: vi.fn().mockResolvedValue(ownership),
  };
  const claimRepo = { findByUserAndSupplier: vi.fn().mockResolvedValue(null) };
  const usersRepo = {
    findProfileById: vi.fn().mockResolvedValue({ id: 42, supplier_id: 100, supplier_link_status: "verified" }),
    bindSupplier: vi.fn(),
  };
  return { ctx: { user: { usersRepo }, supplier: { directoryRepo, claimRepo } }, directoryRepo, claimRepo, usersRepo };
}

function claimReq(supplierId: number) {
  return new NextRequest("http://localhost/api/supplier-claims", {
    method: "POST",
    body: JSON.stringify({ supplier_id: supplierId, license_url: LICENSE_URL }),
  });
}

const FREE = { selfBound: false, boundByOther: false, claimPending: false };

describe("POST /api/supplier-claims 账号侧排他", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolExecute.mockResolvedValue([{ affectedRows: 1 }]);
    vi.mocked(requireUserKeyOrThrow).mockResolvedValue({ userId: 42, authViaJwt: true });
    vi.mocked(createClaimWithBinding).mockResolvedValue({ claimId: 9001, expiresAt: "2026-10-07 00:00:00" });
  });

  it("旧绑定仍在审核中：认领另一家 → 先显式撤回旧绑定，再建认领（不再静默覆盖）", async () => {
    const { ctx } = buildCtx(
      { id: 100, company: "杭州原绑定企业有限公司", verify_status: "pending", claim_status: null },
      FREE,
    );
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await POST(claimReq(200));
    expect(res.status).toBe(201);
    // 旧绑定被显式作废：crm_users 解绑 + 旧 pending 认领作废
    expect(poolExecute.mock.calls[0][0]).toContain("supplier_id = NULL");
    expect(poolExecute.mock.calls[0][1]).toEqual([42, 100]);
    expect(createClaimWithBinding).toHaveBeenCalledTimes(1);
  });

  it("已认证账号认领另一家 → 400（归属一旦确定即为终态，换绑需走后台）", async () => {
    const { ctx } = buildCtx(
      { id: 100, company: "杭州原绑定企业有限公司", verify_status: "done", claim_status: "verified" },
      FREE,
    );
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await POST(claimReq(200));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("一个账号只能认领一家企业");
    expect(poolExecute).not.toHaveBeenCalled();
    expect(createClaimWithBinding).not.toHaveBeenCalled();
  });

  it("已绑定同一主体：沿用「您已绑定该企业，无需重复认领」", async () => {
    const { ctx } = buildCtx(
      { id: 100, company: "杭州原绑定企业有限公司", verify_status: "done", claim_status: null },
      { selfBound: true, boundByOther: false, claimPending: false },
    );
    vi.mocked(getContext).mockReturnValue(ctx as never);
    ctx.supplier.directoryRepo.findById.mockResolvedValue({ id: 100, company: "杭州原绑定企业有限公司" });

    const res = await POST(claimReq(100));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("您已绑定该企业");
    expect(createClaimWithBinding).not.toHaveBeenCalled();
  });

  it("未绑定账号认领未被占用的主体 → 201 建认领并绑定（不变）", async () => {
    const { ctx } = buildCtx(null, FREE);
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await POST(claimReq(200));
    expect(res.status).toBe(201);
    expect(createClaimWithBinding).toHaveBeenCalledTimes(1);
  });

  it("主体侧排他不变：他人已绑定 → 400", async () => {
    const { ctx } = buildCtx(null, { selfBound: false, boundByOther: true, claimPending: false });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await POST(claimReq(200));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("已被其他账户认领");
    expect(createClaimWithBinding).not.toHaveBeenCalled();
  });
});
