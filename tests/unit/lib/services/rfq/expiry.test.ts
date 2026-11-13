/**
 * RFQ 时间驱动流转单测（mock pool）
 * @module tests/unit/lib/services/rfq/expiry
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { advanceRfqLifecycle } from "@/lib/services/rfq/expiry";

const NOW = 1_780_000_000;

function fakePool(opts: {
  published?: Array<{ id: number }>;
  evaluating?: Array<{ id: number; notice_pk: number | null; buyer_user_id: number; title: string }>;
  statusById?: Record<number, string>;
}) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const statusById = opts.statusById ?? {};

  const handle = (sql: string, params?: unknown[]) => {
    calls.push([sql, params]);
    if (sql.startsWith("SELECT id FROM rfq_demand")) return [opts.published ?? []];
    if (sql.startsWith("SELECT id, notice_pk, buyer_user_id, title FROM rfq_demand")) {
      return [opts.evaluating ?? []];
    }
    if (sql.startsWith("SELECT id, status, revision_no FROM rfq_demand")) {
      const id = Number(params?.[0] ?? 0);
      return [[{ id, status: statusById[id] ?? "published", revision_no: 0 }]];
    }
    if (sql.startsWith("SELECT 1 FROM notifications")) return [[]];
    if (sql.startsWith("INSERT INTO notifications")) return [{ insertId: 1 }];
    return [{ affectedRows: 1 }];
  };

  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(async (sql: string, params?: unknown[]) => handle(String(sql), params)),
  };
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => handle(String(sql), params)),
    getConnection: vi.fn().mockResolvedValue(conn),
  };
  return { pool: pool as unknown as Pool, calls, conn };
}

describe("advanceRfqLifecycle", () => {
  it("截止的已发布需求 → evaluation（留事件）", async () => {
    const { pool, calls } = fakePool({ published: [{ id: 1 }], statusById: { 1: "published" } });
    const res = await advanceRfqLifecycle(pool, { now: NOW });

    expect(res).toEqual({ toEvaluation: 1, toClosed: 0 });
    const update = calls.find(([sql]) => sql.includes("UPDATE rfq_demand SET status = ?"));
    expect(update).toBeDefined();
    expect(update![1]).toContain("evaluation");
    expect(calls.some(([sql]) => sql.includes("INSERT INTO rfq_demand_event"))).toBe(true);
  });

  it("评审超期 → closed(expired)，撤投影并通知", async () => {
    const { pool, calls } = fakePool({
      evaluating: [{ id: 2, notice_pk: 9001, buyer_user_id: 42, title: "采购光伏组件" }],
      statusById: { 2: "evaluation" },
    });
    const res = await advanceRfqLifecycle(pool, { now: NOW });

    expect(res).toEqual({ toEvaluation: 0, toClosed: 1 });
    // close_reason=expired
    const update = calls.find(([sql]) => sql.includes("UPDATE rfq_demand SET status = ?"));
    expect(update![1]).toContain("closed");
    expect(update![1]).toContain("expired");
    // 投影删除 + notice_pk 清空
    expect(calls.some(([sql]) => sql.startsWith("DELETE FROM bid_notices"))).toBe(true);
    expect(calls.some(([sql]) => sql.includes("SET notice_pk = NULL"))).toBe(true);
    // 通知
    expect(calls.some(([sql]) => sql.startsWith("INSERT INTO notifications"))).toBe(true);
  });

  it("没有到期数据时不产生任何写操作", async () => {
    const { pool, calls } = fakePool({});
    const res = await advanceRfqLifecycle(pool, { now: NOW });
    expect(res).toEqual({ toEvaluation: 0, toClosed: 0 });
    expect(calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
  });
});
