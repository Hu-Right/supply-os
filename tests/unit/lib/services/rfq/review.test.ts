/**
 * RFQ 审核结论 / 领取单测（mock 连接池）
 * @module tests/unit/lib/services/rfq/review
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { applyReviewDecision, claimReviewTask } from "@/lib/services/rfq/review";
import { DEMAND_STATUS, REVIEW_DECISION } from "@/shared/constants/rfq-demand";

const NOW = 1_777_593_600;
const DEMAND_ID = 7;

function demandRow(over: Record<string, unknown> = {}) {
  return {
    id: DEMAND_ID,
    status: DEMAND_STATUS.SUBMITTED,
    revision_no: 2,
    reference: "OSRFQ-2026-000007",
    title: "采购光伏组件 10MW",
    description: "需求描述",
    category_code: "UGT-0301",
    province_name: "陕西省",
    buyer_org_name: "西安某新能源有限公司",
    close_at: NOW + 3 * 86400,
    budget_amount: "1200.00",
    budget_currency: "CNY",
    budget_confidential: 0,
    notice_pk: null,
    ...over,
  };
}

interface FakeOptions {
  row?: Record<string, unknown> | null;
  dupRow?: Record<string, unknown> | null;
  tasks?: unknown[];
  lifecycle?: { status: string; revision_no: number };
}

function fakePool(opts: FakeOptions = {}) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const row = opts.row === undefined ? demandRow() : opts.row;
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const s = String(sql);
      calls.push([s, params]);
      if (s.startsWith("SELECT demand_id, revision_no, decision FROM rfq_review_task")) {
        return [opts.dupRow ? [opts.dupRow] : []];
      }
      if (s.startsWith("SELECT * FROM rfq_demand")) return [row ? [row] : []];
      if (s.startsWith("SELECT id FROM rfq_review_task")) {
        return [opts.tasks ?? [{ id: 11 }]];
      }
      if (s.startsWith("SELECT id, status FROM rfq_review_task")) {
        return [opts.tasks ?? [{ id: 11, status: "queued" }]];
      }
      if (s.startsWith("SELECT id, status, revision_no FROM rfq_demand")) {
        const lc = opts.lifecycle ?? { status: "submitted", revision_no: 2 };
        return [[{ id: DEMAND_ID, ...lc }]];
      }
      if (s.startsWith("INSERT INTO bid_notices")) return [{ affectedRows: 1, insertId: 9001 }];
      return [{ affectedRows: 1 }];
    }),
  };
  const pool = { getConnection: vi.fn().mockResolvedValue(conn) };
  return { pool: pool as unknown as Pool, conn, calls };
}

function find(calls: Array<[string, unknown[] | undefined]>, needle: string) {
  return calls.find(([sql]) => sql.includes(needle));
}

describe("applyReviewDecision", () => {
  it("同一 callback_id 重复投递 → 返回首次结果，不重复投影", async () => {
    const { pool, calls } = fakePool({
      dupRow: { demand_id: DEMAND_ID, revision_no: 2, decision: REVIEW_DECISION.APPROVED },
    });
    const res = await applyReviewDecision(pool, {
      demandId: DEMAND_ID,
      version: 2,
      decision: REVIEW_DECISION.APPROVED,
      callbackId: "cb-1",
      at: NOW,
    });

    expect(res).toEqual({ ok: true, status: DEMAND_STATUS.PUBLISHED, version: 2, duplicate: true });
    expect(find(calls, "INSERT INTO bid_notices")).toBeUndefined();
  });

  it("需求不存在 → not_found", async () => {
    const { pool } = fakePool({ row: null });
    const res = await applyReviewDecision(pool, {
      demandId: DEMAND_ID, version: 2, decision: REVIEW_DECISION.APPROVED, callbackId: "cb-2", at: NOW,
    });
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("版本不一致 → version_conflict（不覆盖用户改稿）", async () => {
    const { pool, conn } = fakePool({ row: demandRow({ revision_no: 4 }) });
    const res = await applyReviewDecision(pool, {
      demandId: DEMAND_ID, version: 2, decision: REVIEW_DECISION.APPROVED, callbackId: "cb-3", at: NOW,
    });
    expect(res).toEqual({ ok: false, reason: "version_conflict" });
    expect(conn.rollback).toHaveBeenCalledOnce();
  });

  it("工单未入队/已结案 → task_not_found（防止给已撤回需求补结论）", async () => {
    const { pool } = fakePool({ tasks: [] });
    const res = await applyReviewDecision(pool, {
      demandId: DEMAND_ID, version: 2, decision: REVIEW_DECISION.APPROVED, callbackId: "cb-4", at: NOW,
    });
    expect(res).toEqual({ ok: false, reason: "task_not_found" });
  });

  it("退回理由过短 → reason_required", async () => {
    const { pool } = fakePool({ lifecycle: { status: "submitted", revision_no: 2 } });
    const res = await applyReviewDecision(pool, {
      demandId: DEMAND_ID, version: 2, decision: REVIEW_DECISION.REJECTED, reason: "不行", callbackId: "cb-5", at: NOW,
    });
    expect(res).toEqual({ ok: false, reason: "reason_required" });
  });

  it("通过：写投影 + 回填 notice_pk + 工单结案 + 提交", async () => {
    const { pool, calls, conn } = fakePool();
    const res = await applyReviewDecision(pool, {
      demandId: DEMAND_ID, version: 2, decision: REVIEW_DECISION.APPROVED,
      reviewerRef: "RV-2026-0001", callbackId: "cb-6", at: NOW,
    });

    expect(res).toEqual({ ok: true, status: DEMAND_STATUS.PUBLISHED, version: 2 });
    expect(conn.commit).toHaveBeenCalledOnce();

    const insert = find(calls, "INSERT INTO bid_notices");
    expect(insert).toBeDefined();
    // 投影：发布方写 organization；金额写纯数字
    expect(insert![0]).toContain("organization");
    expect(insert![1]).toContain("西安某新能源有限公司");
    expect(insert![1]).toContain("1200");

    expect(find(calls, "UPDATE rfq_demand SET notice_pk")).toBeDefined();
    const taskUpdate = find(calls, "SET status = 'done'");
    expect(taskUpdate).toBeDefined();
    expect(taskUpdate![1]).toContain(REVIEW_DECISION.APPROVED);
    expect(taskUpdate![1]).toContain("cb-6");
  });

  it("退回：不写投影，工单记录理由", async () => {
    const { pool, calls } = fakePool();
    const res = await applyReviewDecision(pool, {
      demandId: DEMAND_ID, version: 2, decision: REVIEW_DECISION.REJECTED,
      reason: "描述缺少技术规格与验收标准，请补充", callbackId: "cb-7", at: NOW,
    });

    expect(res).toEqual({ ok: true, status: DEMAND_STATUS.REJECTED, version: 2 });
    expect(find(calls, "INSERT INTO bid_notices")).toBeUndefined();
    const taskUpdate = find(calls, "SET status = 'done'");
    expect(taskUpdate![1]).toContain(REVIEW_DECISION.REJECTED);
  });
});

describe("claimReviewTask", () => {
  it("领取成功：工单置 claimed，需求转 under_review", async () => {
    const { pool, calls } = fakePool({ lifecycle: { status: "submitted", revision_no: 2 } });
    const res = await claimReviewTask(pool, { demandId: DEMAND_ID, version: 2, claimedBy: "RV-1", at: NOW });

    expect(res).toEqual({ ok: true, status: DEMAND_STATUS.UNDER_REVIEW, version: 2 });
    const claim = find(calls, "status = 'claimed'");
    expect(claim).toBeDefined();
    expect(claim![1]).toEqual(["RV-1", NOW, DEMAND_ID, 2]);
  });

  it("无待领工单 → task_not_found", async () => {
    const { pool } = fakePool({ tasks: [] });
    const res = await claimReviewTask(pool, { demandId: DEMAND_ID, version: 2, claimedBy: "RV-1", at: NOW });
    expect(res).toEqual({ ok: false, reason: "task_not_found" });
  });
});
