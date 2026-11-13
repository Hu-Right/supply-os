/**
 * RFQ 状态机 · 唯一写入口
 * @module lib/services/rfq/lifecycle
 *
 * @description 全仓**只允许**通过本模块修改 `rfq_demand.status`。它解决了重构前的三个结构性问题：
 *              1. 状态写入散在 5 个 route，各自 SELECT + UPDATE，没有一处能约束库外写入；
 *              2. 缺并发保护（只按 id+user_id 更新，审核与改稿可互相覆盖）；
 *              3. 没有审计（谁、何时、从什么到什么、为什么，全部查不到）。
 *
 *              两个入口：
 *              - `transitionDemand(db, …)`：自己开事务，适合单步转移（撤回/重开/领取）；
 *              - `transitionDemandWithin(tx, …)`：在调用方事务内执行，适合"多表原子写"
 *                （提交=版本快照+工单+状态；审核=状态+投影+工单结论）。**不自开连接、不提交**。
 *
 *              实现要点：
 *              - `SELECT … FOR UPDATE` 行锁 + 可选 `expectVersion`（审核回调必须带，防止覆盖用户改稿）；
 *              - 合法性 = 转移表 ∩ 角色白名单；
 *              - 状态变更与事件写入同事务，失败一起回滚；
 *              - 返回判别联合，调用方据此映射 HTTP 码，不抛业务异常。
 */
import type { Pool } from "mysql2/promise";
import {
  DEMAND_ACTOR,
  DEMAND_CLOSE_REASON,
  DEMAND_STATUS,
  type DemandActor,
  type DemandCloseReason,
  type DemandStatus,
} from "@/shared/constants/rfq-demand";
import { appendDemandEvent, type Queryable } from "./events";

/**
 * 状态转移表（与角色无关的合法集合）。
 * `submitted → published/rejected` 存在的原因：领取（claim）是可选动作，
 * 评审后台可能在未领取的情况下直接给出结论。
 */
const ALLOWED_TRANSITIONS: Record<DemandStatus, readonly DemandStatus[]> = {
  [DEMAND_STATUS.DRAFT]: [DEMAND_STATUS.SUBMITTED, DEMAND_STATUS.CLOSED],
  [DEMAND_STATUS.SUBMITTED]: [
    DEMAND_STATUS.UNDER_REVIEW,
    DEMAND_STATUS.PUBLISHED,
    DEMAND_STATUS.REJECTED,
    DEMAND_STATUS.CLOSED,
  ],
  [DEMAND_STATUS.UNDER_REVIEW]: [
    DEMAND_STATUS.PUBLISHED,
    DEMAND_STATUS.REJECTED,
    DEMAND_STATUS.CLOSED,
  ],
  [DEMAND_STATUS.REJECTED]: [
    DEMAND_STATUS.SUBMITTED,
    DEMAND_STATUS.DRAFT,
    DEMAND_STATUS.CLOSED,
  ],
  [DEMAND_STATUS.PUBLISHED]: [DEMAND_STATUS.EVALUATION, DEMAND_STATUS.CLOSED],
  [DEMAND_STATUS.EVALUATION]: [DEMAND_STATUS.CLOSED],
  [DEMAND_STATUS.CLOSED]: [],
};

/** 角色白名单：谁能做哪条转移 */
function isActorAllowed(actor: DemandActor, from: DemandStatus, to: DemandStatus): boolean {
  if (actor === DEMAND_ACTOR.BUYER) {
    if (from === DEMAND_STATUS.DRAFT && to === DEMAND_STATUS.SUBMITTED) return true;
    if (from === DEMAND_STATUS.REJECTED && to === DEMAND_STATUS.SUBMITTED) return true;
    if (from === DEMAND_STATUS.REJECTED && to === DEMAND_STATUS.DRAFT) return true;
    // 采购方只能"取消/撤回"，且只能落到 closed
    return to === DEMAND_STATUS.CLOSED && from !== DEMAND_STATUS.CLOSED;
  }
  if (actor === DEMAND_ACTOR.REVIEWER) {
    if (to === DEMAND_STATUS.UNDER_REVIEW) return from === DEMAND_STATUS.SUBMITTED;
    if (to === DEMAND_STATUS.PUBLISHED || to === DEMAND_STATUS.REJECTED) {
      return from === DEMAND_STATUS.SUBMITTED || from === DEMAND_STATUS.UNDER_REVIEW;
    }
    return false;
  }
  // system：只负责时间驱动的转移
  if (from === DEMAND_STATUS.PUBLISHED && to === DEMAND_STATUS.EVALUATION) return true;
  if (to === DEMAND_STATUS.CLOSED) {
    return from === DEMAND_STATUS.PUBLISHED || from === DEMAND_STATUS.EVALUATION;
  }
  return false;
}

/** 纯函数：给定 from/to/actor 判断是否合法（供 UI 与单测复用，不触库） */
export function canTransition(
  actor: DemandActor,
  from: DemandStatus,
  to: DemandStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) === true && isActorAllowed(actor, from, to);
}

export type TransitionFailure =
  | "not_found"
  | "illegal_transition"
  | "actor_not_allowed"
  | "version_conflict"
  | "reason_required";

export type TransitionResult =
  | { ok: true; status: DemandStatus; from: DemandStatus; version: number }
  | { ok: false; reason: TransitionFailure };

export interface TransitionInput {
  demandId: number;
  to: DemandStatus;
  actor: DemandActor;
  actorId?: number | null;
  /** 期望的当前版本；审核回调必须带，不匹配即 version_conflict（不覆盖用户改稿） */
  expectVersion?: number;
  /** 退回理由（to=rejected 时必填，>=10 字） */
  reason?: string | null;
  /** 结案原因（to=closed 时生效，缺省 cancelled） */
  closeReason?: DemandCloseReason | null;
  /** 审核方标识（工单号/审核人） */
  reviewerRef?: string | null;
  /** 秒级时间戳；缺省取当前时间 */
  at?: number;
}

/** 事务内可用的最小连接接口（Pool 与 PoolConnection 均满足） */
export interface TxLike {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

const EVENT_TYPE: Partial<Record<DemandStatus, string>> = {
  [DEMAND_STATUS.SUBMITTED]: "submitted",
  [DEMAND_STATUS.UNDER_REVIEW]: "claimed",
  [DEMAND_STATUS.PUBLISHED]: "published",
  [DEMAND_STATUS.REJECTED]: "rejected",
  [DEMAND_STATUS.EVALUATION]: "evaluation_started",
  [DEMAND_STATUS.CLOSED]: "closed",
  [DEMAND_STATUS.DRAFT]: "edited",
};

interface DemandRow {
  id: number;
  status: string;
  revision_no: number;
}

/**
 * 在**调用方事务内**执行状态转移：不自开连接、不提交/回滚。
 * 失败时只返回原因，由调用方决定回滚。
 */
export async function transitionDemandWithin(
  tx: TxLike,
  input: TransitionInput,
): Promise<TransitionResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);

  const selected = (await tx.query(
    "SELECT id, status, revision_no FROM rfq_demand WHERE id = ? FOR UPDATE",
    [input.demandId],
  )) as [DemandRow[]];
  const row = selected[0]?.[0];
  if (!row) return { ok: false, reason: "not_found" };

  const from = String(row.status) as DemandStatus;

  if (input.expectVersion !== undefined && Number(row.revision_no) !== input.expectVersion) {
    return { ok: false, reason: "version_conflict" };
  }
  if (!ALLOWED_TRANSITIONS[from]?.includes(input.to)) {
    return { ok: false, reason: "illegal_transition" };
  }
  if (!isActorAllowed(input.actor, from, input.to)) {
    return { ok: false, reason: "actor_not_allowed" };
  }

  const reason = (input.reason ?? "").trim();
  if (input.to === DEMAND_STATUS.REJECTED && reason.length < 10) {
    return { ok: false, reason: "reason_required" };
  }

  const sets: string[] = ["status = ?", "updated_at = ?"];
  const params: unknown[] = [input.to, at];

  if (input.to === DEMAND_STATUS.SUBMITTED) {
    sets.push("submitted_at = ?");
    params.push(at);
  }
  if (input.to === DEMAND_STATUS.UNDER_REVIEW) {
    sets.push("review_claimed_at = ?");
    params.push(at);
  }
  if (input.to === DEMAND_STATUS.PUBLISHED) {
    sets.push("reviewed_at = ?");
    params.push(at);
  }
  if (input.to === DEMAND_STATUS.REJECTED) {
    sets.push("reviewed_at = ?", "reject_reason = ?");
    params.push(at, reason);
  }
  if (input.to === DEMAND_STATUS.CLOSED) {
    sets.push("close_reason = ?");
    params.push(input.closeReason ?? DEMAND_CLOSE_REASON.CANCELLED);
  }
  if (input.reviewerRef) {
    sets.push("reviewer_ref = ?");
    params.push(input.reviewerRef);
  }

  params.push(input.demandId);
  await tx.query(`UPDATE rfq_demand SET ${sets.join(", ")} WHERE id = ?`, params);

  await appendDemandEvent(tx as Queryable, {
    demandId: input.demandId,
    type: EVENT_TYPE[input.to] ?? "status_changed",
    actor: input.actor,
    actorId: input.actorId ?? null,
    fromStatus: from,
    toStatus: input.to,
    payload: {
      ...(reason ? { reason } : {}),
      ...(input.closeReason ? { closeReason: input.closeReason } : {}),
      ...(input.reviewerRef ? { reviewerRef: input.reviewerRef } : {}),
    },
    at,
  });

  return { ok: true, status: input.to, from, version: Number(row.revision_no) };
}

/**
 * 单步转移：自带事务与连接。
 *
 * @example 审核通过（带版本，防覆盖）
 *   await transitionDemand(pool, { demandId, to: "published", actor: "reviewer",
 *     actorId: reviewerId, expectVersion: 3, reviewerRef: "RV-2026-001" })
 */
export async function transitionDemand(
  db: Pool,
  input: TransitionInput,
): Promise<TransitionResult> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await transitionDemandWithin(conn as unknown as TxLike, input);
    if (!result.ok) {
      await conn.rollback();
      return result;
    }
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
