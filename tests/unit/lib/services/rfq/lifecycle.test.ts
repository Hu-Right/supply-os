/**
 * RFQ 状态机单测（mock 连接池，不连库）
 * @module tests/unit/lib/services/rfq/lifecycle
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import {
  canTransition,
  transitionDemand,
  type TransitionInput,
} from "@/lib/services/rfq/lifecycle";
import { DEMAND_ACTOR, DEMAND_STATUS } from "@/shared/constants/rfq-demand";

type Row = { id: number; status: string; revision_no: number };

function makePool(row: Row | null) {
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(),
  };
  conn.query
    .mockResolvedValueOnce([row ? [row] : []])
    .mockResolvedValue([{ affectedRows: 1 }]);

  const pool = { getConnection: vi.fn().mockResolvedValue(conn) };
  return { pool: pool as unknown as Pool, conn };
}

function baseInput(over: Partial<TransitionInput> = {}): TransitionInput {
  return {
    demandId: 7,
    to: DEMAND_STATUS.SUBMITTED,
    actor: DEMAND_ACTOR.BUYER,
    actorId: 42,
    at: 1_760_000_000,
    ...over,
  };
}

describe("canTransition — 转移矩阵", () => {
  it("采购方：draft → submitted / rejected → submitted 合法", () => {
    expect(canTransition(DEMAND_ACTOR.BUYER, DEMAND_STATUS.DRAFT, DEMAND_STATUS.SUBMITTED)).toBe(true);
    expect(canTransition(DEMAND_ACTOR.BUYER, DEMAND_STATUS.REJECTED, DEMAND_STATUS.SUBMITTED)).toBe(true);
  });

  it("采购方：不能自己发布", () => {
    expect(canTransition(DEMAND_ACTOR.BUYER, DEMAND_STATUS.UNDER_REVIEW, DEMAND_STATUS.PUBLISHED)).toBe(false);
    expect(canTransition(DEMAND_ACTOR.BUYER, DEMAND_STATUS.SUBMITTED, DEMAND_STATUS.PUBLISHED)).toBe(false);
  });

  it("审核方：submitted/under_review → published/rejected 合法", () => {
    expect(canTransition(DEMAND_ACTOR.REVIEWER, DEMAND_STATUS.SUBMITTED, DEMAND_STATUS.PUBLISHED)).toBe(true);
    expect(canTransition(DEMAND_ACTOR.REVIEWER, DEMAND_STATUS.UNDER_REVIEW, DEMAND_STATUS.REJECTED)).toBe(true);
  });

  it("审核方：不能撤回、不能重新提交", () => {
    expect(canTransition(DEMAND_ACTOR.REVIEWER, DEMAND_STATUS.PUBLISHED, DEMAND_STATUS.CLOSED)).toBe(false);
    expect(canTransition(DEMAND_ACTOR.REVIEWER, DEMAND_STATUS.REJECTED, DEMAND_STATUS.SUBMITTED)).toBe(false);
  });

  it("系统：published → evaluation，evaluation → closed", () => {
    expect(canTransition(DEMAND_ACTOR.SYSTEM, DEMAND_STATUS.PUBLISHED, DEMAND_STATUS.EVALUATION)).toBe(true);
    expect(canTransition(DEMAND_ACTOR.SYSTEM, DEMAND_STATUS.EVALUATION, DEMAND_STATUS.CLOSED)).toBe(true);
    expect(canTransition(DEMAND_ACTOR.SYSTEM, DEMAND_STATUS.DRAFT, DEMAND_STATUS.CLOSED)).toBe(false);
  });

  it("closed 是终态", () => {
    for (const to of Object.values(DEMAND_STATUS)) {
      expect(canTransition(DEMAND_ACTOR.SYSTEM, DEMAND_STATUS.CLOSED, to)).toBe(false);
    }
  });
});

describe("transitionDemand — 写状态与审计", () => {
  it("draft → submitted：成功并写入事件", async () => {
    const { pool, conn } = makePool({ id: 7, status: DEMAND_STATUS.DRAFT, revision_no: 0 });
    const res = await transitionDemand(pool, baseInput());

    expect(res).toEqual({
      ok: true,
      status: DEMAND_STATUS.SUBMITTED,
      from: DEMAND_STATUS.DRAFT,
      version: 0,
    });
    expect(conn.commit).toHaveBeenCalledOnce();
    // SELECT + UPDATE + INSERT(event)
    expect(conn.query).toHaveBeenCalledTimes(3);
    const eventCall = conn.query.mock.calls[2];
    expect(String(eventCall[0])).toContain("INSERT INTO rfq_demand_event");
    expect((eventCall[1] as unknown[])[1]).toBe("submitted");
  });

  it("版本不匹配 → version_conflict 且回滚（审核不覆盖用户改稿）", async () => {
    const { pool, conn } = makePool({ id: 7, status: DEMAND_STATUS.UNDER_REVIEW, revision_no: 4 });
    const res = await transitionDemand(
      pool,
      baseInput({ to: DEMAND_STATUS.PUBLISHED, actor: DEMAND_ACTOR.REVIEWER, expectVersion: 3 }),
    );

    expect(res).toEqual({ ok: false, reason: "version_conflict" });
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it("非法转移 → illegal_transition", async () => {
    const { pool, conn } = makePool({ id: 7, status: DEMAND_STATUS.PUBLISHED, revision_no: 1 });
    const res = await transitionDemand(pool, baseInput({ to: DEMAND_STATUS.SUBMITTED }));
    expect(res).toEqual({ ok: false, reason: "illegal_transition" });
    expect(conn.rollback).toHaveBeenCalledOnce();
  });

  it("角色不符 → actor_not_allowed", async () => {
    const { pool } = makePool({ id: 7, status: DEMAND_STATUS.UNDER_REVIEW, revision_no: 1 });
    const res = await transitionDemand(pool, baseInput({ to: DEMAND_STATUS.PUBLISHED }));
    expect(res).toEqual({ ok: false, reason: "actor_not_allowed" });
  });

  it("退回必须带 >=10 字理由", async () => {
    const { pool } = makePool({ id: 7, status: DEMAND_STATUS.UNDER_REVIEW, revision_no: 1 });
    const short = await transitionDemand(
      pool,
      baseInput({ to: DEMAND_STATUS.REJECTED, actor: DEMAND_ACTOR.REVIEWER, reason: "太短了" }),
    );
    expect(short).toEqual({ ok: false, reason: "reason_required" });
  });

  it("退回成功时把理由写进 reject_reason 与事件", async () => {
    const { pool, conn } = makePool({ id: 7, status: DEMAND_STATUS.UNDER_REVIEW, revision_no: 2 });
    const res = await transitionDemand(
      pool,
      baseInput({
        to: DEMAND_STATUS.REJECTED,
        actor: DEMAND_ACTOR.REVIEWER,
        reason: "描述缺少技术规格与验收标准，请补充",
        reviewerRef: "RV-2026-0001",
      }),
    );

    expect(res.ok).toBe(true);
    const updateCall = conn.query.mock.calls[1];
    expect(String(updateCall[0])).toContain("reject_reason = ?");
    expect(String(updateCall[0])).toContain("reviewer_ref = ?");
    const eventParams = conn.query.mock.calls[2][1] as unknown[];
    expect(JSON.parse(String(eventParams[6]))).toMatchObject({
      reason: "描述缺少技术规格与验收标准，请补充",
      reviewerRef: "RV-2026-0001",
    });
  });

  it("需求不存在 → not_found", async () => {
    const { pool, conn } = makePool(null);
    const res = await transitionDemand(pool, baseInput());
    expect(res).toEqual({ ok: false, reason: "not_found" });
    expect(conn.rollback).toHaveBeenCalledOnce();
  });

  it("结案写入 close_reason", async () => {
    const { pool, conn } = makePool({ id: 7, status: DEMAND_STATUS.PUBLISHED, revision_no: 1 });
    const res = await transitionDemand(
      pool,
      baseInput({ to: DEMAND_STATUS.CLOSED, actor: DEMAND_ACTOR.BUYER, closeReason: "cancelled" }),
    );

    expect(res.ok).toBe(true);
    expect(String(conn.query.mock.calls[1][0])).toContain("close_reason = ?");
  });
});
