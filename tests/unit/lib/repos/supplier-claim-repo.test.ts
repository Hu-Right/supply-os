/**
 * 供应商认领仓储派生查询测试（hasPendingClaim / hasApprovedClaim）
 * @module tests/unit/lib/repos/supplier-claim-repo.test.ts
 * @description 认领状态自 2026-11-11 起由关系事实派生（ADR-0017，supplier.claim_status 已退役）：
 *              1. hasPendingClaim 走 supplier_claims EXISTS(status='pending')，是本轮
 *                 「认领处理中」的唯一来源（排他闸口 / 企业 GET 的 hasPendingClaim）；
 *              2. hasApprovedClaim 走 supplier_claims EXISTS(status='approved')，是本轮
 *                 「认领已通过」的唯一来源（换照闸口）；
 *              3. 两方法都只用参数化 supplierId，且把驱动返回的 1/0/NULL 归一为布尔。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierClaimRepo } from "@/lib/repos/suppliers/supplier-claim.repo";

describe("SupplierClaimRepo 认领状态派生查询", () => {
  const mockExecute = vi.fn();
  const mockPool = { execute: mockExecute } as any;
  let repo: SupplierClaimRepo;

  beforeEach(() => {
    repo = new SupplierClaimRepo(mockPool);
    mockExecute.mockReset();
  });

  it("hasPendingClaim：EXISTS(status='pending') 参数化，命中 → true", async () => {
    mockExecute.mockResolvedValue([[{ claim_pending: 1 }]]);

    await expect(repo.hasPendingClaim(18084)).resolves.toBe(true);

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("SELECT EXISTS(");
    expect(sql).toContain("FROM supplier_claims c");
    expect(sql).toContain("c.supplier_id = ?");
    expect(sql).toContain("c.status = 'pending'");
    expect(sql).toContain("AS claim_pending");
    expect(params).toEqual([18084]);
  });

  it("hasPendingClaim：0 与 NULL（无行/空集）都归 false", async () => {
    mockExecute.mockResolvedValue([[{ claim_pending: 0 }]]);
    await expect(repo.hasPendingClaim(1)).resolves.toBe(false);

    mockExecute.mockResolvedValue([[{ claim_pending: null }]]);
    await expect(repo.hasPendingClaim(1)).resolves.toBe(false);

    mockExecute.mockResolvedValue([[]]);
    await expect(repo.hasPendingClaim(1)).resolves.toBe(false);
  });

  it("hasApprovedClaim：EXISTS(status='approved') 参数化，命中 → true", async () => {
    mockExecute.mockResolvedValue([[{ claim_approved: 1 }]]);

    await expect(repo.hasApprovedClaim(18084)).resolves.toBe(true);

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FROM supplier_claims c");
    expect(sql).toContain("c.supplier_id = ?");
    expect(sql).toContain("c.status = 'approved'");
    expect(sql).toContain("AS claim_approved");
    expect(params).toEqual([18084]);
  });

  it("hasApprovedClaim：0 与 NULL 都归 false", async () => {
    mockExecute.mockResolvedValue([[{ claim_approved: 0 }]]);
    await expect(repo.hasApprovedClaim(1)).resolves.toBe(false);

    mockExecute.mockResolvedValue([[{ claim_approved: null }]]);
    await expect(repo.hasApprovedClaim(1)).resolves.toBe(false);
  });

  it("两个派生查询都不读 supplier.claim_status（已退役列的读点清零）", async () => {
    mockExecute.mockResolvedValue([[{ claim_pending: 0, claim_approved: 0 }]]);
    await repo.hasPendingClaim(1);
    await repo.hasApprovedClaim(1);
    for (const [sql] of mockExecute.mock.calls) {
      expect(String(sql)).not.toContain("claim_status");
    }
  });
});
