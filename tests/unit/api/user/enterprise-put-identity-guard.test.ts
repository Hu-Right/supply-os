/**
 * PUT /api/user/enterprise — 已认证主体身份要素不可改写
 * @module tests/unit/api/user/enterprise-put-identity-guard.test.ts
 * @description 堵住「换主体」的最后一条暗道：已认证账号原本可以用 PUT 把 company /
 *              credit_code 直接改成另一家公司，等于绕过审核把平台认证
 *              挪到别处（POST/认领侧已被账号排他拦死，编辑侧却没有）。口径：
 *              1. verified + 身份字段有实际变化 → 400，不落库；
 *              2. verified + 身份字段原值回传（表单每次都全量提交）→ 放行；
 *              3. verified + 只改联系方式等非身份字段 → 放行；
 *              4. pending（审核中）→ 允许补正身份字段（这正是驳回/审核期的正当路径）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/context", () => ({ getContext: vi.fn() }));
// enterprise-binding 服务现在持有连接池入口（换绑时要解绑账号）：本用例不走那条路径，
// 但必须把真 pool 隔掉，否则 jsdom 环境会撞上 server-only。
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ execute: vi.fn().mockResolvedValue([{ affectedRows: 0 }]) }) }));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: vi.fn() }));
vi.mock("@/lib/services/file-upload", () => ({ deleteFile: vi.fn(), licenseFilenameFromUrl: (url: string) => typeof url === "string" && url.includes("/") ? url.slice(url.lastIndexOf("/") + 1) || null : null }));
vi.mock("@/lib/services/license-change", () => ({ upsertPendingLicenseChange: vi.fn() }));

import { PUT } from "@/app/api/user/enterprise/route";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { upsertPendingLicenseChange } from "@/lib/services/license-change";

const STORED = {
  id: 100,
  company: "杭州原绑定企业有限公司",
  credit_code: "91330100MA2XXXXXX1",
  contact: "张三",
  phone: "15800000000",
};

function buildCtx(rowOverride: Record<string, unknown> = {}) {
  const directoryRepo = {
    findProfileById: vi.fn(),
    findFullById: vi.fn().mockResolvedValue({ ...STORED, ...rowOverride }),
    updateEnterprise: vi.fn().mockResolvedValue(undefined),
    updateLicenseUrl: vi.fn().mockResolvedValue(undefined),
  };
  const claimRepo = {
    findByUserAndSupplier: vi.fn().mockResolvedValue(null),
    insertClaim: vi.fn().mockResolvedValue(9001),
    extendPendingClaimExpiry: vi.fn(),
    // 认领状态改为 supplier_claims 派生（claim_status 已退役，ADR-0017）
    hasPendingClaim: vi.fn().mockResolvedValue(false),
    hasApprovedClaim: vi.fn().mockResolvedValue(false),
  };
  const usersRepo = {
    findProfileById: vi.fn().mockResolvedValue({ id: 42, supplier_id: 100, supplier_link_status: "verified" }),
    bindSupplier: vi.fn(),
  };
  return {
    ctx: { user: { usersRepo }, supplier: { directoryRepo, claimRepo } },
    directoryRepo,
    claimRepo,
  };
}

function putReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/user/enterprise", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

describe("PUT /api/user/enterprise 身份要素闸口", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUserKeyOrThrow).mockResolvedValue({ userId: 42, authViaJwt: true });
  });

  it("已认证：改统一社会信用代码 → 400，不落库", async () => {
    const { ctx, directoryRepo } = buildCtx({ verify_status: "done" });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ company: STORED.company, credit_code: "91310000ZZZZZZZZ9" }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("主体");
    expect(directoryRepo.updateEnterprise).not.toHaveBeenCalled();
  });

  it("已认证：把公司名改成另一家 → 400", async () => {
    const { ctx, directoryRepo } = buildCtx({ verify_status: "done" });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ company: "上海另一家公司有限公司" }));
    expect(res.status).toBe(400);
    expect(directoryRepo.updateEnterprise).not.toHaveBeenCalled();
  });

  it("已认证但存在 pending 认领 → 归「审核中」，允许补正身份字段（与分类器同口径）", async () => {
    const { ctx, claimRepo, directoryRepo } = buildCtx({ verify_status: "done" });
    claimRepo.hasPendingClaim.mockResolvedValue(true);
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ company: "上海另一家公司有限公司" }));
    expect(res.status).toBe(200);
    expect(directoryRepo.updateEnterprise).toHaveBeenCalled();
  });

  it("已认证：身份字段原值回传（表单全量提交）→ 放行", async () => {
    const { ctx, directoryRepo } = buildCtx({ verify_status: "done" });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({
      company: STORED.company,
      credit_code: STORED.credit_code,
      products: "新增主营产品",
    }));
    expect(res.status).toBe(200);
    expect(directoryRepo.updateEnterprise).toHaveBeenCalledWith(100, expect.objectContaining({ products: "新增主营产品" }));
  });

  it("已认证：只改联系类字段 → 放行（自愈检查会取行判断认证态，不再是无查库）", async () => {
    const { ctx, directoryRepo } = buildCtx({ verify_status: "done" });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ contact: "李四", phone: "13900000000" }));
    expect(res.status).toBe(200);
    // 2026-11-11 批量核验口径：done 行只代表平台核验可展示，用户认证仍需持自己的认领单，
    // 因此 PUT 末尾的 legacy 自愈会为 done 行补建认领单（防冒认已核验主体）。
    expect(directoryRepo.updateEnterprise).toHaveBeenCalled();
  });

  it("legacy 自愈：绑定了未认证行且无认领单 → PUT 补建认领单", async () => {
    const { ctx, claimRepo } = buildCtx({ verify_status: "pending" });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ contact: "李四" }));
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ claimCreated: true, licensePendingReview: false });
    expect(claimRepo.insertClaim).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, supplierId: 100 }),
    );
  });

  it("legacy 自愈：已有有效认领单 / 已认证行 → 不重复建单", async () => {
    const { ctx, claimRepo } = buildCtx({ verify_status: "done" });
    vi.mocked(getContext).mockReturnValue(ctx as never);
    claimRepo.findByUserAndSupplier.mockResolvedValue({ id: 8, status: "approved", created_at: null, expires_at: null } as never);

    const res = await PUT(putReq({ contact: "李四" }));
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ claimCreated: false, licensePendingReview: false });
    expect(claimRepo.insertClaim).not.toHaveBeenCalled();
  });

  it("先审后生效：已认证行换执照 → 登记待审、不直写 license_url；done 行同样补建认领单", async () => {
    const { ctx, directoryRepo, claimRepo } = buildCtx({
      verify_status: "done",
      license_url: "/api/user/enterprise/license/license_42_1111111111.png",
    });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ license_url: "/api/user/enterprise/license/license_42_2222222222.png" }));
    expect(res.status).toBe(200);
    // 2026-11-11 批量核验口径：done 只代表平台核验可展示，用户认证仍需持自己的认领单（防冒认），
    // 故本轮自愈会补建认领单；换照仍走「先审后生效」。
    expect((await res.json())).toEqual({ claimCreated: true, licensePendingReview: true });
    expect(claimRepo.insertClaim).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, supplierId: 100 }),
    );
    expect(upsertPendingLicenseChange).toHaveBeenCalledWith({
      supplierId: 100,
      filename: "license_42_2222222222.png",
      prevFilename: "license_42_1111111111.png",
      uploadedBy: 42,
    });
    // 先审后生效：supplier.license_url 保持旧图
    expect(directoryRepo.updateLicenseUrl).not.toHaveBeenCalled();
  });

  it("认领已通过（存在 approved 认领）、认证待审的行换执照 → 同样进入待审", async () => {
    const { ctx, directoryRepo, claimRepo } = buildCtx({
      verify_status: "pending",
      license_url: "/api/user/enterprise/license/license_42_1111111111.png",
    });
    // 模拟真实状态：该行已有一条 approved 认领（故自愈不再建单，换照闸口据此判「已归属」）
    claimRepo.findByUserAndSupplier.mockResolvedValue({ id: 21, status: "approved", created_at: null, expires_at: null } as never);
    claimRepo.hasApprovedClaim.mockResolvedValue(true);
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ license_url: "/api/user/enterprise/license/license_42_2222222222.png" }));
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ claimCreated: false, licensePendingReview: true });
    expect(upsertPendingLicenseChange).toHaveBeenCalledWith({
      supplierId: 100,
      filename: "license_42_2222222222.png",
      prevFilename: "license_42_1111111111.png",
      uploadedBy: 42,
    });
    expect(directoryRepo.updateLicenseUrl).not.toHaveBeenCalled();
  });

  it("未认证行换执照 → 直接生效（不走待审）", async () => {
    const { ctx, directoryRepo } = buildCtx({ verify_status: "pending" });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ license_url: "/api/user/enterprise/license/license_42_3333333333.png" }));
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ claimCreated: true, licensePendingReview: false });
    expect(upsertPendingLicenseChange).not.toHaveBeenCalled();
    expect(directoryRepo.updateLicenseUrl).toHaveBeenCalled();
  });

  it("审核中：允许补正身份字段（驳回/审核期的正当路径）", async () => {
    const { ctx, directoryRepo } = buildCtx({ verify_status: "pending" });
    vi.mocked(getContext).mockReturnValue(ctx as never);

    const res = await PUT(putReq({ company: "杭州原绑定企业有限公司", credit_code: "91330100MA2YYYYYY2" }));
    expect(res.status).toBe(200);
    expect(directoryRepo.updateEnterprise).toHaveBeenCalled();
  });
});
