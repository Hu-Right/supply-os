/**
 * RFQ 答疑单测（mock pool）
 * @module tests/unit/lib/services/rfq/qa
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { answerQuestion, askQuestion, listQa } from "@/lib/services/rfq/qa";

const NOW = 1_780_000_000;

function fakePool(opts: {
  demand?: { buyer_user_id: number; status: string; close_at: number | null } | null;
  answerRow?: { answer: string | null } | null;
  qaRows?: unknown[];
}) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      const s = String(sql);
      if (s.startsWith("SELECT buyer_user_id, status, close_at FROM rfq_demand")) {
        return [opts.demand ? [opts.demand] : []];
      }
      if (s.startsWith("SELECT id, asker_user_id, question")) return [opts.qaRows ?? []];
      if (s.startsWith("INSERT INTO rfq_qa")) return [{ insertId: 77 }];
      if (s.startsWith("SELECT answer FROM rfq_qa")) {
        return [opts.answerRow ? [opts.answerRow] : []];
      }
      return [{ affectedRows: 1 }];
    }),
  };
  return { pool: pool as unknown as Pool, calls };
}

const openDemand = { buyer_user_id: 42, status: "published", close_at: NOW + 86400 };

describe("askQuestion", () => {
  it("问题过短 → invalid，不查库", async () => {
    const { pool, calls } = fakePool({ demand: openDemand });
    const res = await askQuestion(pool, { demandId: 1, userId: 88, question: "太短", at: NOW });
    expect(res).toEqual({ ok: false, reason: "invalid" });
    expect(calls).toHaveLength(0);
  });

  it("需求不存在 → not_found", async () => {
    const { pool } = fakePool({ demand: null });
    const res = await askQuestion(pool, { demandId: 1, userId: 88, question: "请问交付地点可以变更吗？", at: NOW });
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("采购方不能自问 → self", async () => {
    const { pool } = fakePool({ demand: openDemand });
    const res = await askQuestion(pool, { demandId: 1, userId: 42, question: "请问交付地点可以变更吗？", at: NOW });
    expect(res).toEqual({ ok: false, reason: "self" });
  });

  it("未发布 / 已截止 → not_open", async () => {
    const draft = fakePool({ demand: { ...openDemand, status: "draft" } });
    expect(await askQuestion(draft.pool, { demandId: 1, userId: 88, question: "请问交付地点可以变更吗？", at: NOW }))
      .toEqual({ ok: false, reason: "not_open" });

    const expired = fakePool({ demand: { ...openDemand, close_at: NOW - 1 } });
    expect(await askQuestion(expired.pool, { demandId: 1, userId: 88, question: "请问交付地点可以变更吗？", at: NOW }))
      .toEqual({ ok: false, reason: "not_open" });
  });

  it("成功写入并返回 id", async () => {
    const { pool, calls } = fakePool({ demand: openDemand });
    const res = await askQuestion(pool, { demandId: 1, userId: 88, question: "请问交付地点可以变更吗？", at: NOW });
    expect(res).toEqual({ ok: true, id: 77 });
    const insert = calls.find(([sql]) => sql.startsWith("INSERT INTO rfq_qa"))!;
    expect(insert[1]).toEqual([1, 88, "请问交付地点可以变更吗？", "public", NOW]);
  });
});

describe("answerQuestion", () => {
  it("非所有者 → forbidden", async () => {
    const { pool } = fakePool({ demand: openDemand });
    const res = await answerQuestion(pool, { demandId: 1, qaId: 5, buyerUserId: 999, answer: "可以", at: NOW });
    expect(res).toEqual({ ok: false, reason: "forbidden" });
  });

  it("已答复 → already_answered", async () => {
    const { pool } = fakePool({ demand: openDemand, answerRow: { answer: "已答" } });
    const res = await answerQuestion(pool, { demandId: 1, qaId: 5, buyerUserId: 42, answer: "可以", at: NOW });
    expect(res).toEqual({ ok: false, reason: "already_answered" });
  });

  it("成功答复写 answered_by/answered_at", async () => {
    const { pool, calls } = fakePool({ demand: openDemand, answerRow: { answer: null } });
    const res = await answerQuestion(pool, { demandId: 1, qaId: 5, buyerUserId: 42, answer: "可以变更", at: NOW });
    expect(res).toEqual({ ok: true });
    const upd = calls.find(([sql]) => sql.startsWith("UPDATE rfq_qa"))!;
    expect(upd[1]).toEqual(["可以变更", 42, NOW, 5, 1]);
  });
});

describe("listQa", () => {
  it("只取公开提问或本人提问，并标记 askedByMe", async () => {
    const { pool, calls } = fakePool({
      qaRows: [
        { id: 1, asker_user_id: 88, question: "Q1", answer: null, answered_at: null, created_at: NOW, visibility: "public" },
        { id: 2, asker_user_id: 99, question: "Q2", answer: "A2", answered_at: NOW, created_at: NOW, visibility: "public" },
      ],
    });
    const items = await listQa(pool, 1, 88);
    expect(items).toHaveLength(2);
    expect(items[0].askedByMe).toBe(true);
    expect(items[1].askedByMe).toBe(false);
    const sql = String(calls[0][0]);
    expect(sql).toContain("visibility = 'public' OR asker_user_id = ?");
  });
});
