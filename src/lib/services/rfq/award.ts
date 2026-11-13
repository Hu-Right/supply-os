/**
 * RFQ 选定 / 撤销选定（v2）
 * @module lib/services/rfq/award
 *
 * @description 定标是"结案动作"：写 `rfq_award` 留痕 → 报价置 won/lost →
 *              需求 `→ closed(awarded)`（撤下搜索投影）→ 通知双方。
 *              撤销定标把需求从 `closed(awarded)` 拉回 `evaluation`，报价恢复 submitted，
 *              授标行保留（`revoked_at` 非空），形成完整审计。
 *
 *              过渡期：报价数据仍在 legacy `rfq_quotes`（按投影 id），因此本服务通过
 *              `rfq_demand.notice_pk` 定位报价；P2 报价迁表后改为 `demand_id`。
 */
import type { Pool } from "mysql2/promise";
import {
  DEMAND_ACTOR,
  DEMAND_CLOSE_REASON,
  DEMAND_STATUS,
} from "@/shared/constants/rfq-demand";
import { QUOTE_STATUS } from "@/shared/constants/rfq";
import { transitionDemandWithin, type TxLike } from "./lifecycle";
import { removeProjection } from "./projection";
import { notifyAwardResult } from "./notify";

export interface AwardInput {
  demandId: number;
  quoteId: number;
  buyerUserId: number;
  reason: string;
  at?: number;
}

export type AwardResult =
  | { ok: true; status: string }
  | { ok: false; reason: "not_found" | "forbidden" | "invalid" | "not_awardable" | "quote_not_found" };

interface DemandRow {
  id: number;
  buyer_user_id: number;
  status: string;
  notice_pk: number | null;
  title: string;
}

export async function awardQuote(db: Pool, input: AwardInput): Promise<AwardResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 5) return { ok: false, reason: "invalid" };

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const selected = (await conn.query(
      "SELECT id, buyer_user_id, status, notice_pk, title FROM rfq_demand WHERE id = ? FOR UPDATE",
      [input.demandId],
    )) as unknown as [DemandRow[]];
    const demand = selected[0]?.[0];
    if (!demand) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (Number(demand.buyer_user_id) !== input.buyerUserId) {
      await conn.rollback();
      return { ok: false, reason: "forbidden" };
    }
    const status = String(demand.status);
    if (status !== DEMAND_STATUS.PUBLISHED && status !== DEMAND_STATUS.EVALUATION) {
      await conn.rollback();
      return { ok: false, reason: "not_awardable" };
    }
    const noticePk = demand.notice_pk == null ? null : Number(demand.notice_pk);
    if (!noticePk) {
      await conn.rollback();
      return { ok: false, reason: "not_awardable" };
    }

    const submittedRows = (await conn.query(
      `SELECT id, supplier_user_id FROM rfq_quotes
        WHERE rfq_id = ? AND status = ? FOR UPDATE`,
      [noticePk, QUOTE_STATUS.SUBMITTED],
    )) as unknown as [Array<{ id: number; supplier_user_id: number }>];
    const submitted = submittedRows[0] ?? [];
    const quote = submitted.find((q) => Number(q.id) === input.quoteId);
    if (!quote) {
      await conn.rollback();
      return { ok: false, reason: "quote_not_found" };
    }

    await conn.query(
      `UPDATE rfq_quotes SET status = ? WHERE rfq_id = ? AND status = ?`,
      [QUOTE_STATUS.REJECTED, noticePk, QUOTE_STATUS.SUBMITTED],
    );
    await conn.query(
      `UPDATE rfq_quotes SET status = ? WHERE id = ?`,
      [QUOTE_STATUS.WON, input.quoteId],
    );

    await conn.query(
      `INSERT INTO rfq_award (demand_id, quote_id, supplier_user_id, reason, awarded_by, awarded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [input.demandId, input.quoteId, Number(quote.supplier_user_id), reason, input.buyerUserId, at],
    );

    const transition = await transitionDemandWithin(conn as unknown as TxLike, {
      demandId: input.demandId,
      to: DEMAND_STATUS.CLOSED,
      actor: DEMAND_ACTOR.BUYER,
      actorId: input.buyerUserId,
      closeReason: DEMAND_CLOSE_REASON.AWARDED,
      reason,
      at,
    });
    if (!transition.ok) {
      await conn.rollback();
      return { ok: false, reason: "not_awardable" };
    }

    await removeProjection(conn as unknown as Pool, noticePk);
    await conn.query("UPDATE rfq_demand SET notice_pk = NULL WHERE id = ?", [input.demandId]);

    await conn.commit();

    // 定标回执：中标 + 落选（站内信；失败不影响定标）
    try {
      await notifyAwardResult(db, {
        demandId: input.demandId,
        title: String(demand.title ?? ""),
        winnerSupplierUserId: Number(quote.supplier_user_id),
        loserSupplierUserIds: submitted.map((q) => Number(q.supplier_user_id)),
      });
    } catch (err) {
      console.warn("[rfq-award] 定标通知失败（不影响定标）:", (err as Error).message);
    }

    return { ok: true, status: transition.status };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export interface UnawardInput {
  demandId: number;
  buyerUserId: number;
  reason?: string | null;
  at?: number;
}

export type UnawardResult =
  | { ok: true; status: string }
  | { ok: false; reason: "not_found" | "forbidden" | "no_award" | "not_reversible" };

interface AwardRow {
  id: number;
  quote_id: number;
}

export async function unawardQuote(db: Pool, input: UnawardInput): Promise<UnawardResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const selected = (await conn.query(
      "SELECT id, buyer_user_id, status, notice_pk FROM rfq_demand WHERE id = ? FOR UPDATE",
      [input.demandId],
    )) as unknown as [Array<{ id: number; buyer_user_id: number; status: string; notice_pk: number | null }>];
    const demand = selected[0]?.[0];
    if (!demand) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (Number(demand.buyer_user_id) !== input.buyerUserId) {
      await conn.rollback();
      return { ok: false, reason: "forbidden" };
    }

    const awardRows = (await conn.query(
      `SELECT id, quote_id FROM rfq_award
        WHERE demand_id = ? AND revoked_at IS NULL
        ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [input.demandId],
    )) as unknown as [AwardRow[]];
    const award = awardRows[0]?.[0];
    if (!award) {
      await conn.rollback();
      return { ok: false, reason: "no_award" };
    }

    await conn.query(
      "UPDATE rfq_award SET revoked_at = ?, revoke_reason = ? WHERE id = ?",
      [at, input.reason ? String(input.reason).slice(0, 500) : null, Number(award.id)],
    );

    const noticePk = demand.notice_pk == null ? null : Number(demand.notice_pk);
    if (noticePk) {
      await conn.query(
        `UPDATE rfq_quotes SET status = ? WHERE rfq_id = ? AND status IN (?, ?)`,
        [QUOTE_STATUS.SUBMITTED, noticePk, QUOTE_STATUS.WON, QUOTE_STATUS.REJECTED],
      );
    }

    const transition = await transitionDemandWithin(conn as unknown as TxLike, {
      demandId: input.demandId,
      to: DEMAND_STATUS.EVALUATION,
      actor: DEMAND_ACTOR.BUYER,
      actorId: input.buyerUserId,
      at,
    });
    if (!transition.ok) {
      await conn.rollback();
      return { ok: false, reason: "not_reversible" };
    }

    await conn.commit();
    return { ok: true, status: transition.status };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
