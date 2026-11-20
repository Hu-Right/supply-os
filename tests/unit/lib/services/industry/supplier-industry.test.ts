/**
 * 供应商行业自报落库单测（事务内：主码覆盖 + self_report 挂靠；清空回落管线码）
 * @module tests/unit/lib/services/industry/supplier-industry
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { saveSupplierIndustrySelfReport } from "@/lib/services/industry/supplier-industry";

function fakeDb(handlers: Array<[string, (sql: string, params?: unknown[]) => unknown]>) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push([sql, params]);
    for (const [fragment, fn] of handlers) if (sql.includes(fragment)) return fn(sql, params);
    return [[]];
  });
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query,
  };
  return { db: { getConnection: vi.fn().mockResolvedValue(conn) } as unknown as Pool, conn, calls };
}

describe("saveSupplierIndustrySelfReport", () => {
  it("设置行业：校验节点存在 → 清旧 self_report → 落新挂靠 → 覆盖主码", async () => {
    const { db, conn, calls } = fakeDb([
      ["FROM supplier WHERE id", () => [[{ id: 9, industry_code: null }]]],
      ["FROM industry_nodes", () => [[{ code: "UGT-I-0301" }]]],
      ["FROM supplier_industry_rel WHERE supplier_id = ? AND source = 'self_report'", () => [[]]],
    ]);

    const res = await saveSupplierIndustrySelfReport(db, { supplierId: 9, code: "UGT-I-0301" });

    expect(res).toEqual({ ok: true, code: "UGT-I-0301" });
    expect(conn.commit).toHaveBeenCalled();
    expect(calls.some(([sql]) => sql.includes("DELETE FROM supplier_industry_rel"))).toBe(true);
    const insert = calls.find(([sql]) => sql.includes("INSERT INTO supplier_industry_rel"));
    expect(insert?.[1]).toEqual([9, "UGT-I-0301"]);
    const update = calls.find(([sql]) => sql.includes("UPDATE supplier SET industry_code"));
    expect(update?.[1]).toEqual(["UGT-I-0301", 9]);
  });

  it("码形非法直接拒绝，不开事务", async () => {
    const { db, conn } = fakeDb([]);
    const res = await saveSupplierIndustrySelfReport(db, { supplierId: 9, code: "UGT-032605" });
    expect(res).toEqual({ ok: false, reason: "invalid_code" });
    expect(conn.beginTransaction).not.toHaveBeenCalled();
  });

  it("节点不存在 → invalid_code 并回滚", async () => {
    const { db, conn } = fakeDb([
      ["FROM supplier WHERE id", () => [[{ id: 9, industry_code: null }]]],
      ["FROM industry_nodes", () => [[]]],
    ]);
    const res = await saveSupplierIndustrySelfReport(db, { supplierId: 9, code: "UGT-I-999999" });
    expect(res).toEqual({ ok: false, reason: "invalid_code" });
    expect(conn.rollback).toHaveBeenCalled();
  });

  it("清空：删自报行；主码原来自报则回落到剩余挂靠（无则 NULL）", async () => {
    const { db, calls } = fakeDb([
      ["FROM supplier WHERE id", () => [[{ id: 9, industry_code: "UGT-I-0301" }]]],
      ["FROM supplier_industry_rel WHERE supplier_id = ? AND source = 'self_report'", () => [[{ industry_code: "UGT-I-0301" }]]],
      ["FROM supplier_industry_rel WHERE supplier_id = ? ORDER BY id ASC", () => [[]]],
    ]);

    const res = await saveSupplierIndustrySelfReport(db, { supplierId: 9, code: null });

    expect(res).toEqual({ ok: true, code: null });
    const update = calls.find(([sql]) => sql.includes("UPDATE supplier SET industry_code"));
    expect(update?.[1]).toEqual([null, 9]);
  });
});