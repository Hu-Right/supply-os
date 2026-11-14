/**
 * F04/F05 单测：自动初审（九项规则版）与主体核验留痕
 * @module tests/unit/lib/services/procurement/review-verification
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { buyerStatusForResult, recordBuyerVerification } from "@/lib/services/procurement/buyers";
import { runAutoReview } from "@/lib/services/procurement/reviews";

const NOW = 1_777_593_600;

interface Handler {
  [fragment: string]: (sql: string) => unknown;
}

function fakeDb(handlers: Handler) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      for (const key of Object.keys(handlers)) if (sql.includes(key)) return handlers[key](sql);
      return [[{ affectedRows: 1 }]];
    }),
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      for (const key of Object.keys(handlers)) if (sql.includes(key)) return handlers[key](sql);
      return [{ affectedRows: 1, insertId: 55 }];
    }),
  };
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      for (const key of Object.keys(handlers)) if (sql.includes(key)) return handlers[key](sql);
      return [[]];
    }),
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      for (const key of Object.keys(handlers)) if (sql.includes(key)) return handlers[key](sql);
      return [{ affectedRows: 1, insertId: 55 }];
    }),
    getConnection: vi.fn().mockResolvedValue(conn),
  } as unknown as Pool;
  return { pool, conn, calls };
}

describe("F05 主体核验留痕", () => {
  it("结论 → 状态映射：pass/need_info/reject", () => {
    expect(buyerStatusForResult("pass")).toBe("verified");
    expect(buyerStatusForResult("need_info")).toBe("need_info");
    expect(buyerStatusForResult("reject")).toBe("restricted");
  });

  it("写留痕 + 回写主体状态（同事务）", async () => {
    const { pool, calls, conn } = fakeDb({
      "SELECT id FROM procurement_buyers": () => [[{ id: 3 }]],
      "FROM procurement_buyer_verifications": () => [[]],
      "INSERT INTO procurement_buyer_verifications": () => [{ insertId: 88 }],
    });
    const r = await recordBuyerVerification(pool, {
      buyerId: 3,
      kind: "identity",
      result: "pass",
      reviewer: "RV-01",
      note: "执照与注册信息一致",
      callbackId: "cb-1",
      at: NOW,
    });
    expect(r).toEqual({ ok: true, verificationId: 88, status: "verified" });
    expect(calls.find(([sql]) => sql.includes("INSERT INTO procurement_buyer_verifications"))).toBeDefined();
    const upd = calls.find(([sql]) => sql.includes("UPDATE procurement_buyers SET status"));
    expect(upd).toBeDefined();
    expect(upd![1]).toContain("verified");
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  it("同一 callbackId 重复投递 → duplicate，不再写留痕", async () => {
    const { pool, calls } = fakeDb({
      "SELECT id FROM procurement_buyers": () => [[{ id: 3 }]],
      "FROM procurement_buyer_verifications": () => [[{ id: 88 }]],
      "SELECT status FROM procurement_buyers": () => [[{ status: "verified" }]],
    });
    const r = await recordBuyerVerification(pool, {
      buyerId: 3,
      kind: "identity",
      result: "pass",
      reviewer: "RV-01",
      callbackId: "cb-1",
    });
    expect(r).toEqual({ ok: true, verificationId: 88, status: "verified", duplicate: true });
    expect(calls.find(([sql]) => sql.includes("INSERT INTO procurement_buyer_verifications"))).toBeUndefined();
  });

  it("主体不存在 → not_found", async () => {
    const { pool } = fakeDb({ "SELECT id FROM procurement_buyers": () => [[]] });
    const r = await recordBuyerVerification(pool, {
      buyerId: 9,
      kind: "fund",
      result: "pass",
      reviewer: "RV-01",
    });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("F04 系统自动初审", () => {
  const baseProject = {
    id: 7,
    buyer_id: 1,
    title_zh: "采购学生课桌椅",
    delivery_country: "肯尼亚",
    delivery_city: "内罗毕",
    quote_deadline_at: NOW + 86400,
    compliance: null,
  };

  function projectDb(project: Record<string, unknown>, dup = false) {
    return fakeDb({
      "SELECT * FROM procurement_projects": () => [[project]],
      "SELECT id, reference FROM procurement_projects": () => (dup ? [[{ id: 1, reference: "OSPR-2026-000001" }]] : [[]]),
      "INSERT INTO procurement_reviews": () => [{ insertId: 12 }],
    });
  }

  it("资料齐全 → pass，落 AUTO 记录并同步 requirement_verify", async () => {
    const { pool, calls } = projectDb(baseProject);
    const out = await runAutoReview(pool, 7, 1, NOW);
    expect(out.result).toBe("pass");
    expect(out.reviewId).toBe(12);
    expect(calls.find(([sql]) => sql.includes("INSERT INTO procurement_reviews"))).toBeDefined();
    const upd = calls.find(([sql]) => sql.includes("UPDATE procurement_projects SET requirement_verify"));
    expect(upd![1]).toEqual(["pass", NOW, 7]);
  });

  it("缺交付地/截止时间 → need_info（退回补全）", async () => {
    const { pool } = projectDb({ ...baseProject, delivery_country: null, delivery_city: null, quote_deadline_at: null });
    const out = await runAutoReview(pool, 7, 1, NOW);
    expect(out.result).toBe("need_info");
    expect(out.checks.completeness).toBe("fail");
  });

  it("合规自述命中 / 同主体同标题重复 → risk", async () => {
    const { pool } = projectDb(
      { ...baseProject, compliance: JSON.stringify({ flags: ["dual_use"], note: null }) },
      true,
    );
    const out = await runAutoReview(pool, 7, 1, NOW);
    expect(out.result).toBe("risk");
    expect(out.checks.compliance).toBe("flagged");
    expect(out.checks.duplication).toBe("suspect");
  });

  it("合规自述为空数组/空串 → 不算命中（回归 Boolean([]) 误判）", async () => {
    const { pool } = projectDb({ ...baseProject, compliance: JSON.stringify({ flags: [], note: "无" }) });
    const out = await runAutoReview(pool, 7, 1, NOW);
    expect(out.checks.compliance).toBe("pass");
    expect(out.result).toBe("pass");
  });

  it("记录里保留九项检查明细（证据可追溯）", async () => {
    const { pool, calls } = projectDb(baseProject);
    await runAutoReview(pool, 7, 1, NOW);
    const insert = calls.find(([sql]) => sql.includes("INSERT INTO procurement_reviews"));
    const evidence = JSON.parse(String(insert![1]?.[5])) as { checks: Record<string, string> };
    expect(Object.keys(evidence.checks)).toHaveLength(9);
    expect(insert![1]?.[0]).toBe(7);
  });
});
