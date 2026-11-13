/**
 * RFQ 关闭（采购方撤回 / 取消）
 * @module lib/services/rfq/close
 *
 * @description 撤回不是一个单纯的字段更新：published 的需求在 `bid_notices` 里有一行搜索投影，
 *              关闭时必须**同时**撤下投影，否则会出现"详情 404、搜索还能搜到"的不一致
 *              （重构前靠 5 分钟的平台漂移对账兜底）。这里与状态转移同事务完成。
 */
import type { Pool } from "mysql2/promise";
import { DEMAND_ACTOR, DEMAND_CLOSE_REASON, DEMAND_STATUS } from "@/shared/constants/rfq-demand";
import { transitionDemandWithin, type TxLike } from "./lifecycle";
import { removeProjection } from "./projection";

export interface CloseDemandInput {
  demandId: number;
  buyerUserId: number;
  reason?: string | null;
  at?: number;
}

export type CloseDemandResult =
  | { ok: true; status: string }
  | { ok: false; reason: "not_found" | "forbidden" | "not_closable" };

interface DemandRow {
  id: number;
  buyer_user_id: number;
  status: string;
  notice_pk: number | null;
}

export async function closeDemand(
  db: Pool,
  input: CloseDemandInput,
): Promise<CloseDemandResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const selected = (await conn.query(
      "SELECT id, buyer_user_id, status, notice_pk FROM rfq_demand WHERE id = ? FOR UPDATE",
      [input.demandId],
    )) as unknown as [DemandRow[]];
    const row = selected[0]?.[0];
    if (!row) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (Number(row.buyer_user_id) !== input.buyerUserId) {
      await conn.rollback();
      return { ok: false, reason: "forbidden" };
    }

    const transition = await transitionDemandWithin(conn as unknown as TxLike, {
      demandId: input.demandId,
      to: DEMAND_STATUS.CLOSED,
      actor: DEMAND_ACTOR.BUYER,
      actorId: input.buyerUserId,
      closeReason: DEMAND_CLOSE_REASON.CANCELLED,
      reason: input.reason ?? null,
      at,
    });
    if (!transition.ok) {
      await conn.rollback();
      return { ok: false, reason: "not_closable" };
    }

    await removeProjection(conn as unknown as Pool, row.notice_pk == null ? null : Number(row.notice_pk));
    if (row.notice_pk != null) {
      await conn.query("UPDATE rfq_demand SET notice_pk = NULL WHERE id = ?", [input.demandId]);
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
