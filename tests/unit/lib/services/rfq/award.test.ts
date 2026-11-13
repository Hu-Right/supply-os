/**
 * RFQ 定标 / 撤销定标单测（mock pool）
 * @module tests/unit/lib/services/rfq/award
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { awardQuote, unawardQuote } from "@/lib/services/rfq/award";

const NOW = 1_780_000_000;

interface Opts {
  demand?: { id: number; buyer_user_id: number; status: string; notice_pk: number | null; title?: string } | null;
  quote?: { id: number; supplier_user_id: number } | null;
  award?: { id: number; quote_id: number } | null;
}

function fakePool(opts: Opts) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const handle = (sql: string, params?: unknown[]) => {
    calls.push([sql, params]);
    const s = sql;
    if (s.startsWith("SELECT id, buyer_user_id, status, notice_pk")) {
      return [opts.demand ? [opts.demand] : []];
    }
    if (s.startsWith("SELECT id, supplier_user_id FROM rfq_quotes")) {
      return [opts.quote ? [opts.quote] : []];
    }
    if (s.startsWith("SELECT id, quote_id FROM rfq_award")) {
      return [opts.award ? [opts.award] : []];
    }
    if (s.startsWith("SELECT id, status, revision_no FROM rfq_demand")) {
      const id = Number(params?.[0] ?? 0);
      return [[{ id, status: opts.demand?.status ?? "published", revision_no: 0 }]];
    }
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
    query: vi.fn(async (sql: string) => {
      // 定标后的站内信去重查询
      if (String(sql).startsWith("SELECT 1 FROM notifications")) return [[]];
      return [{ affectedRows: 1, insertId: 1 }];
    }),
    getConnection: vi.fn().mockResolvedValue(conn),
  } as unknown as Pool;
  return { pool, calls, conn };
}

const demandRow = { id: 7, buyer_user_id: 42, status: "evaluation", notice_pk: 9001, title: "采购光伏组件" };

describe("awardQuote", () => {
  it("理由过短 → invalid，不触库", async () => {
    const { pool, calls } = fakePool({ demand: demandRow });
    expect(await awardQuote(pool, { demandId: 7, quoteId: 1, buyerUserId: 42, reason: "好", at: NOW }))
      .toEqual({ ok: false, reason: "invalid" });
    expect(calls).toHaveLength(0);
  });

  it("非所有者 → forbidden", async () => {
    const { pool } = fakePool({ demand: demandRow });
    expect(await awardQuote(pool, { demandId: 7, quoteId: 1, buyerUserId: 999, reason: "价格与交期最优", at: NOW }))
      .toEqual({ ok: false, reason: "forbidden" });
  });

  it("状态不可定标 → not_awardable", async () => {
    const { pool } = fakePool({ demand: { ...demandRow, status: "closed" } });
    expect(await awardQuote(pool, { demandId: 7, quoteId: 1, buyerUserId: 42, reason: "价格与交期最优", at: NOW }))
      .toEqual({ ok: false, reason: "not_awardable" });
  });

  it("报价不存在/已撤回 → quote_not_found", async () => {
    const { pool } = fakePool({ demand: demandRow, quote: null });
    expect(await awardQuote(pool, { demandId: 7, quoteId: 1, buyerUserId: 42, reason: "价格与交期最优", at: NOW }))
      .toEqual({ ok: false, reason: "quote_not_found" });
  });

  it("成功：报价置 won/lost、写授标、需求结案、撤投影", async () => {
    const { pool, calls, conn } = fakePool({
      demand: demandRow,
      quote: { id: 11, supplier_user_id: 88 },
    });
    const res = await awardQuote(pool, {
      demandId: 7, quoteId: 11, buyerUserId: 42, reason: "价格与交期最优", at: NOW,
    });

    expect(res).toEqual({ ok: true, status: "closed" });
    expect(conn.commit).toHaveBeenCalledOnce();

    const rejectOthers = calls.find(([s]) => s.startsWith("UPDATE rfq_quotes SET status = ? WHERE rfq_id = ?"));
    expect(rejectOthers![1]?.[0]).toBe("rejected");
    const setWinner = calls.find(([s]) => s === "UPDATE rfq_quotes SET status = ? WHERE id = ?");
    expect(setWinner![1]).toEqual(["won", 11]);

    const award = calls.find(([s]) => s.startsWith("INSERT INTO rfq_award"));
    expect(award![1]).toEqual([7, 11, 88, "价格与交期最优", 42, NOW]);

    const close = calls.find(([s]) => s.includes("UPDATE rfq_demand SET status = ?"));
    expect(close![1]).toContain("closed");
    expect(close![1]).toContain("awarded");

    expect(calls.some(([s]) => s.startsWith("DELETE FROM bid_notices"))).toBe(true);
    expect(calls.some(([s]) => s.includes("SET notice_pk = NULL"))).toBe(true);
  });
});

describe("unawardQuote", () => {
  it("无生效授标 → no_award", async () => {
    const { pool } = fakePool({ demand: { ...demandRow, status: "closed" }, award: null });
    expect(await unawardQuote(pool, { demandId: 7, buyerUserId: 42, at: NOW }))
      .toEqual({ ok: false, reason: "no_award" });
  });

  it("成功：授标留痕撤销、报价回 submitted、需求回 evaluation", async () => {
    const { pool, calls, conn } = fakePool({
      demand: { ...demandRow, status: "closed" },
      award: { id: 3, quote_id: 11 },
    });
    const res = await unawardQuote(pool, { demandId: 7, buyerUserId: 42, reason: "供应商弃标", at: NOW });

    expect(res).toEqual({ ok: true, status: "evaluation" });
    expect(conn.commit).toHaveBeenCalledOnce();

    const revoke = calls.find(([s]) => s.startsWith("UPDATE rfq_award SET revoked_at"));
    expect(revoke![1]).toEqual([NOW, "供应商弃标", 3]);

    const reset = calls.find(([s]) => s.startsWith("UPDATE rfq_quotes SET status = ? WHERE rfq_id"));
    expect(reset![1]).toContain("submitted");

    const back = calls.find(([s]) => s.includes("UPDATE rfq_demand SET status = ?"));
    expect(back![1]).toContain("evaluation");
  });
});
