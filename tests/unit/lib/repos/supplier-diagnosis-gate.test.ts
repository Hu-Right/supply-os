/**
 * 诊断写权闸口测试（2026-11-11 一司一份口径）
 * @module tests/unit/lib/repos/supplier-diagnosis-gate.test.ts
 * @description 钉住两件事：
 *              1. 纯函数 `diagnosisWriteGateDecision` 的判定矩阵——归属人（selfBound）
 *                 一票放行；有主主体（他人绑定 / 认领排他期 / 已归属 / 已认证）非归属人一律拒绝；
 *                 完全无主主体对登录用户开放。
 *              2. `getWriteGate` 的 SQL 形状——三个 EXISTS 派生（users ×2、supplier_claims ×2）
 *                 加显式 verify_status='done'（与门户公开目录同口径：NULL 历史行不算已认证）；
 *                 主体行不存在时兜底返回 false（拒绝）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierDiagnosisRepo, diagnosisWriteGateDecision } from "@/lib/repos/supplier-diagnosis.repo";

describe("diagnosisWriteGateDecision（纯函数判定矩阵）", () => {
  const base = { selfBound: false, boundByOther: false, claimPending: false, claimed: false, verifyDone: false };

  it("完全无主：开放给登录用户", () => {
    expect(diagnosisWriteGateDecision(base)).toBe(true);
  });

  it("归属人一票放行：即使同时存在他人绑定/认证等其他标记", () => {
    expect(diagnosisWriteGateDecision({ ...base, selfBound: true })).toBe(true);
    expect(diagnosisWriteGateDecision({ ...base, selfBound: true, boundByOther: true, claimed: true, verifyDone: true })).toBe(true);
  });

  it("有主且非归属人：四种「有主」标记各自独立拒绝", () => {
    expect(diagnosisWriteGateDecision({ ...base, boundByOther: true })).toBe(false);
    expect(diagnosisWriteGateDecision({ ...base, claimPending: true })).toBe(false);
    expect(diagnosisWriteGateDecision({ ...base, claimed: true })).toBe(false);
    expect(diagnosisWriteGateDecision({ ...base, verifyDone: true })).toBe(false);
  });
});

describe("SupplierDiagnosisRepo.getWriteGate（SQL 形状与兜底）", () => {
  const mockExecute = vi.fn();
  const repo = new SupplierDiagnosisRepo({ execute: mockExecute } as any);

  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("SQL 用 EXISTS 派生绑定与认领，认证标只认显式 'done'", async () => {
    mockExecute.mockResolvedValue([[{ self_bound: 0, bound_others: 0, claim_pending: 0, claimed: 0, verify_done: 0 }]]);
    await repo.getWriteGate(11, 7);

    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain("FROM users u");
    expect(sql).toContain("u.id = ?");
    expect(sql).toContain("u2.id <> ?");
    expect(sql).toContain("FROM supplier_claims c");
    expect(sql).toContain("c.status = 'pending'");
    expect(sql).toContain("FROM supplier_claims c2");
    expect(sql).toContain("c2.status = 'approved'");
    expect(sql).toContain("s.verify_status = 'done'");
    expect(sql).not.toContain("claim_status");
    // 占位符：userId 出现两次（u/u2），supplierId 出现三次（c/c2/s）
    expect(params).toEqual([7, 7, 11, 11, 11]);
  });

  it("命中归属人 → true；命中他人绑定 → false", async () => {
    mockExecute.mockResolvedValue([[{ self_bound: 1, bound_others: 0, claim_pending: 0, claimed: 0, verify_done: 1 }]]);
    expect(await repo.getWriteGate(11, 7)).toBe(true);

    mockExecute.mockResolvedValue([[{ self_bound: 0, bound_others: 1, claim_pending: 0, claimed: 0, verify_done: 0 }]]);
    expect(await repo.getWriteGate(11, 7)).toBe(false);
  });

  it("主体行不存在：兜底返回 false（拒绝）", async () => {
    mockExecute.mockResolvedValue([[]]);
    expect(await repo.getWriteGate(999, 7)).toBe(false);
  });
});
