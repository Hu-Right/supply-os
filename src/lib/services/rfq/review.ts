/**
 * RFQ 审核结论与领取
 * @module lib/services/rfq/review
 *
 * @description 评审后台经签名回调把结论写回门户。本模块是**唯一**处理该结论的地方：
 *              - 版本校验：`revision_no` 必须等于回调携带的版本，否则 409（不覆盖用户改稿）；
 *              - 幂等：同一 `callback_id` 重复投递直接返回首次结果；
 *              - 通过：状态转 published + 投影到 `bid_notices` + 工单结案（同事务）；
 *              - 退回：状态转 rejected + 理由入库 + 工单结案。
 *
 *              投影与状态同事务：要么"已发布且可被搜索"，要么都不成立，不出现半发布。
 */
import type { Pool } from "mysql2/promise";
import {
  DEMAND_ACTOR,
  DEMAND_STATUS,
  REVIEW_DECISION,
  type ReviewDecision,
} from "@/shared/constants/rfq-demand";
import { transitionDemandWithin, type TxLike } from "./lifecycle";
import { upsertProjection, type ProjectionSource } from "./projection";
import { registerRfqGuard } from "@/lib/services/rfq-guard";
import { generateMatchCandidates } from "./matching";
import { notifyReviewResult } from "./notify";

export interface ReviewDecisionInput {
  demandId: number;
  /** 回调携带的版本号（= 提交时的 revision_no） */
  version: number;
  decision: ReviewDecision;
  /** 退回理由（decision=rejected 时必填，>=10 字） */
  reason?: string | null;
  reviewerRef?: string | null;
  /** 回调幂等键（X-Review-Request-Id） */
  callbackId: string;
  at?: number;
}

export type ReviewDecisionResult =
  | { ok: true; status: string; version: number; duplicate?: boolean }
  | {
      ok: false;
      reason:
        | "not_found"
        | "version_conflict"
        | "illegal_transition"
        | "reason_required"
        | "task_not_found"
        | "authorization_required";
    };

export interface ClaimReviewInput {
  demandId: number;
  version: number;
  claimedBy: string;
  at?: number;
}

export type ClaimReviewResult =
  | { ok: true; status: string; version: number }
  | { ok: false; reason: "task_not_found" | "illegal_transition" | "version_conflict" };

interface DemandRow {
  id: number;
  buyer_user_id: number;
  status: string;
  revision_no: number;
  reference: string;
  title: string;
  description: string | null;
  category_code: string | null;
  province_name: string | null;
  buyer_org_name: string | null;
  close_at: number | null;
  budget_amount: string | number | null;
  budget_currency: string;
  budget_confidential: number;
  notice_pk: number | null;
}

function toProjectionSource(row: DemandRow, publishedAt: number): ProjectionSource {
  return {
    demandId: Number(row.id),
    noticePk: row.notice_pk == null ? null : Number(row.notice_pk),
    reference: String(row.reference),
    title: String(row.title),
    description: row.description,
    categoryCode: row.category_code,
    provinceName: row.province_name,
    buyerOrgName: row.buyer_org_name,
    buyerUserId: row.buyer_user_id == null ? null : Number(row.buyer_user_id),
    closeAt: row.close_at == null ? null : Number(row.close_at),
    publishedAt,
    budgetAmount: row.budget_amount == null ? null : Number(row.budget_amount),
    budgetCurrency: String(row.budget_currency || "CNY"),
    budgetConfidential: Number(row.budget_confidential) === 1,
  };
}

/** 审核方领取工单（可选动作）：submitted → under_review，并标记工单 claimed */
export async function claimReviewTask(
  db: Pool,
  input: ClaimReviewInput,
): Promise<ClaimReviewResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [tasks] = await conn.query(
      `SELECT id, status FROM rfq_review_task
        WHERE demand_id = ? AND revision_no = ? AND status = 'queued' FOR UPDATE`,
      [input.demandId, input.version],
    );
    if ((tasks as { id: number }[]).length === 0) {
      await conn.rollback();
      return { ok: false, reason: "task_not_found" };
    }

    const transition = await transitionDemandWithin(conn as unknown as TxLike, {
      demandId: input.demandId,
      to: DEMAND_STATUS.UNDER_REVIEW,
      actor: DEMAND_ACTOR.REVIEWER,
      expectVersion: input.version,
      at,
    });
    if (!transition.ok) {
      await conn.rollback();
      return {
        ok: false,
        reason: transition.reason === "version_conflict" ? "version_conflict" : "illegal_transition",
      };
    }

    await conn.query(
      `UPDATE rfq_review_task SET status = 'claimed', claimed_by = ?, claimed_at = ?
        WHERE demand_id = ? AND revision_no = ?`,
      [input.claimedBy, at, input.demandId, input.version],
    );

    await conn.commit();
    return { ok: true, status: transition.status, version: input.version };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** 应用审核结论（通过/退回），含幂等、版本校验与投影 */
export async function applyReviewDecision(
  db: Pool,
  input: ReviewDecisionInput,
): Promise<ReviewDecisionResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 幂等：同一回调重复投递，返回首次结果（不重复投影、不重复通知）
    const [dup] = await conn.query(
      `SELECT demand_id, revision_no, decision FROM rfq_review_task WHERE callback_id = ? LIMIT 1`,
      [input.callbackId],
    );
    const dupRow = (dup as { demand_id: number; revision_no: number; decision: string | null }[])[0];
    if (dupRow) {
      await conn.rollback();
      return {
        ok: true,
        status: dupRow.decision === REVIEW_DECISION.APPROVED
          ? DEMAND_STATUS.PUBLISHED
          : DEMAND_STATUS.REJECTED,
        version: Number(dupRow.revision_no),
        duplicate: true,
      };
    }

    const [rows] = await conn.query(
      "SELECT * FROM rfq_demand WHERE id = ? FOR UPDATE",
      [input.demandId],
    );
    const row = (rows as DemandRow[])[0];
    if (!row) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (Number(row.revision_no) !== Number(input.version)) {
      await conn.rollback();
      return { ok: false, reason: "version_conflict" };
    }

    // 工单必须存在且未结案（防止对已撤回/已结案的需求补发结论）
    const [tasks] = await conn.query(
      `SELECT id FROM rfq_review_task
        WHERE demand_id = ? AND revision_no = ? AND status IN ('queued','claimed') FOR UPDATE`,
      [input.demandId, input.version],
    );
    if ((tasks as { id: number }[]).length === 0) {
      await conn.rollback();
      return { ok: false, reason: "task_not_found" };
    }

    const approved = input.decision === REVIEW_DECISION.APPROVED;
    const target = approved ? DEMAND_STATUS.PUBLISHED : DEMAND_STATUS.REJECTED;

    // 发布闸口（流程第 6 步）：授权书按「需求编号+版本」绑定，approved 必须已 verified。
    // 校验放在状态转移之前——工单不被消耗，采购方补签后同一工单可重走结论。
    if (approved) {
      const [authRows] = await conn.query(
        `SELECT status FROM rfq_demand_authorization
          WHERE demand_id = ? AND revision_no = ?
          ORDER BY id DESC LIMIT 1`,
        [input.demandId, input.version],
      );
      const authRow = (authRows as Array<{ status: string }>)[0];
      if (!authRow || String(authRow.status) !== "verified") {
        await conn.rollback();
        return { ok: false, reason: "authorization_required" };
      }
    }

    const transition = await transitionDemandWithin(conn as unknown as TxLike, {
      demandId: input.demandId,
      to: target,
      actor: DEMAND_ACTOR.REVIEWER,
      reason: input.reason ?? null,
      reviewerRef: input.reviewerRef ?? null,
      expectVersion: input.version,
      at,
    });
    if (!transition.ok) {
      await conn.rollback();
      if (transition.reason === "reason_required") return { ok: false, reason: "reason_required" };
      if (transition.reason === "version_conflict") return { ok: false, reason: "version_conflict" };
      return { ok: false, reason: "illegal_transition" };
    }

    if (approved) {
      // 报价窗口：open_at 缺省设为发布时刻；close_at 由提交时的截止时间决定
      await conn.query(
        `UPDATE rfq_demand
            SET open_at = COALESCE(open_at, ?), updated_at = ?
          WHERE id = ?`,
        [at, at, input.demandId],
      );
      const noticePk = await upsertProjection(
        conn as unknown as Pool,
        toProjectionSource(row, at),
      );
      if (noticePk && noticePk !== Number(row.notice_pk ?? 0)) {
        await conn.query("UPDATE rfq_demand SET notice_pk = ? WHERE id = ?", [noticePk, input.demandId]);
      }
      // 守护登记与投影同事务：登记表是「平台行预期归属」的可靠真相，
      // 缺登记则 30 分钟一轮的守护对账对 v2 平台行失效（爬虫撞号改写无告警）
      if (noticePk) {
        await registerRfqGuard(conn as unknown as Pool, {
          rfqId: noticePk,
          reference: String(row.reference ?? ""),
          userId: row.buyer_user_id == null ? null : Number(row.buyer_user_id),
        });
      }
    }

    await conn.query(
      `UPDATE rfq_review_task
          SET status = 'done', decision = ?, reason = ?, decided_at = ?, callback_id = ?
        WHERE demand_id = ? AND revision_no = ?`,
      [
        approved ? REVIEW_DECISION.APPROVED : REVIEW_DECISION.REJECTED,
        (input.reason ?? "").trim() || null,
        at,
        input.callbackId,
        input.demandId,
        input.version,
      ],
    );

    await conn.commit();

    // 发布即匹配（流程第 7 步）：规则版候选名单，best-effort——失败不影响发布结论，下轮可补
    if (approved) {
      try {
        await generateMatchCandidates(db, input.demandId);
      } catch (err) {
        console.warn("[rfq-review] 匹配候选生成失败（不影响发布）:", (err as Error).message);
      }
    }

    // 回执：审核结论通知采购方（同 (user,type,ref) 只推一次；失败不影响结论）
    try {
      await notifyReviewResult(db, {
        demandId: input.demandId,
        buyerUserId: Number(row.buyer_user_id),
        title: String(row.title ?? ""),
        approved,
        reason: input.reason ?? null,
      });
    } catch (err) {
      console.warn("[rfq-review] 审核结论通知失败（不影响结论落库）:", (err as Error).message);
    }

    return { ok: true, status: target, version: input.version };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
