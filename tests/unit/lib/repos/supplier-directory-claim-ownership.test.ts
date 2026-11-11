/**
 * 认领归属细查（getClaimOwnership）测试
 * @module tests/unit/lib/repos/supplier-directory-claim-ownership.test.ts
 * @description 钉住认领排他的三态口径，供重复认领的精确拒绝文案：
 *              1. 自己已绑定（selfBound）→ 提示「您已绑定该企业」；
 *              2. 他人已绑定（boundByOther）→ 提示「已被其他账户认领，无法重复认领」；
 *              3. 无绑定但存在 pending 认领（claimPending）→ 提示「已有认领申请处理中」；
 *                 认领处理中自 2026-11-11 起由 supplier_claims 派生（supplier.claim_status 已退役，
 *                 ADR-0017），第二查询是 EXISTS(... status='pending')，不再是读 supplier 列；
 *              4. SUM 空集为 NULL 不得误判为已绑定；
 *              5. isClaimed 以 uid=0 复用同一查询，任意绑定都算已认领。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierDirectoryRepo } from "@/lib/repos/suppliers/supplier-directory.repo";

describe("SupplierDirectoryRepo.getClaimOwnership", () => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery } as any;
  let repo: SupplierDirectoryRepo;

  beforeEach(() => {
    repo = new SupplierDirectoryRepo(mockPool);
    mockQuery.mockReset();
    // 第一次 query 命中 users 聚合，第二次命中 supplier_claims 的 EXISTS 派生
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("users")) return [[{ others: 0, mine: 1 }]];
      return [[{ claim_pending: 0 }]];
    });
  });

  it("自己已绑定：selfBound=true", async () => {
    expect(await repo.getClaimOwnership(18, 42)).toEqual({
      selfBound: true, boundByOther: false, claimPending: false,
    });
  });

  it("他人已绑定：boundByOther=true", async () => {
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("users")) return [[{ others: 1, mine: 0 }]];
      return [[{ claim_pending: 0 }]];
    });
    expect(await repo.getClaimOwnership(18, 42)).toEqual({
      selfBound: false, boundByOther: true, claimPending: false,
    });
  });

  it("无绑定但存在 pending 认领：claimPending=true（supplier_claims 派生）", async () => {
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("users")) return [[{ others: 0, mine: 0 }]];
      return [[{ claim_pending: 1 }]];
    });
    expect(await repo.getClaimOwnership(18, 42)).toEqual({
      selfBound: false, boundByOther: false, claimPending: true,
    });
    // 第二查询必须是关系派生，而不是读已退役的 supplier.claim_status 列
    const claimSql = String(mockQuery.mock.calls[1][0]);
    expect(claimSql).toContain("FROM supplier_claims c");
    expect(claimSql).toContain("c.status = 'pending'");
    expect(claimSql).not.toContain("supplier.claim_status");
  });

  it("绑定行 SUM 空集（NULL）不误判为已绑定", async () => {
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("users")) return [[{ others: null, mine: null }]];
      return [[{ claim_pending: null }]];
    });
    expect(await repo.getClaimOwnership(18, 42)).toEqual({
      selfBound: false, boundByOther: false, claimPending: false,
    });
  });

  it("isClaimed 以 uid=0 复用同一查询：任意绑定都算已认领", async () => {
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("users")) return [[{ others: 1, mine: 0 }]];
      return [[{ claim_pending: 0 }]];
    });
    expect(await repo.isClaimed(18)).toBe(true);
  });
});
