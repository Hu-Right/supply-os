/**
 * RFQ 时间驱动流转（到期 → 评审 → 过期关闭）
 * @module lib/services/rfq/expiry
 *
 * @description 重构前 `rfq_status` 永远停在 published：广场虽然用 `deadline_sec` 过滤，
 *              但状态、统计、邀约、后续动作都把它当"活跃需求"。这里把时间维度补进状态机：
 *
 *              published ──(close_at 到)──► evaluation ──(close_at + 14 天)──► closed(expired)
 *
 *              - 每一步都走 `transitionDemand`（system 角色），自动留事件；
 *              - 过期关闭时同步撤下搜索投影，避免"详情 404、搜索还能搜到"；
 *              - 通知采购方，失败不影响流转（best-effort）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  DEMAND_ACTOR,
  DEMAND_CLOSE_REASON,
  DEMAND_STATUS,
  EVALUATION_WINDOW_DAYS,
} from "@/shared/constants/rfq-demand";
import { transitionDemand } from "./lifecycle";
import { notifyDemandExpired } from "./notify";
import { removeProjection } from "./projection";

export interface AdvanceLifecycleOptions {
  /** 当前时间（秒），便于测试注入 */
  now?: number;
  /** 单轮每类最多处理多少条 */
  batch?: number;
}

export interface AdvanceLifecycleResult {
  toEvaluation: number;
  toClosed: number;
}

interface PublishedRow extends RowDataPacket {
  id: number;
}

interface EvaluationRow extends RowDataPacket {
  id: number;
  notice_pk: number | null;
  buyer_user_id: number;
  title: string;
}

/**
 * 推进一轮时间驱动流转。幂等：同一行只会被推进一次（状态已变则退出候选集）。
 */
export async function advanceRfqLifecycle(
  db: Pool,
  opts: AdvanceLifecycleOptions = {},
): Promise<AdvanceLifecycleResult> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const batch = Math.max(1, opts.batch ?? 100);

  let toEvaluation = 0;
  let toClosed = 0;

  // ① 报价截止 → 评审
  const [pubRows] = await db.query(
    `SELECT id FROM rfq_demand
      WHERE status = ? AND close_at IS NOT NULL AND close_at < ?
      ORDER BY close_at ASC LIMIT ?`,
    [DEMAND_STATUS.PUBLISHED, now, batch],
  );
  for (const row of pubRows as PublishedRow[]) {
    const res = await transitionDemand(db, {
      demandId: Number(row.id),
      to: DEMAND_STATUS.EVALUATION,
      actor: DEMAND_ACTOR.SYSTEM,
      at: now,
    });
    if (res.ok) toEvaluation += 1;
  }

  // ② 评审超期 → 过期结案（并撤投影、通知）
  const expireBefore = now - EVALUATION_WINDOW_DAYS * 86400;
  const [evalRows] = await db.query(
    `SELECT id, notice_pk, buyer_user_id, title FROM rfq_demand
      WHERE status = ? AND close_at IS NOT NULL AND close_at < ?
      ORDER BY close_at ASC LIMIT ?`,
    [DEMAND_STATUS.EVALUATION, expireBefore, batch],
  );
  for (const row of evalRows as EvaluationRow[]) {
    const demandId = Number(row.id);
    const res = await transitionDemand(db, {
      demandId,
      to: DEMAND_STATUS.CLOSED,
      actor: DEMAND_ACTOR.SYSTEM,
      closeReason: DEMAND_CLOSE_REASON.EXPIRED,
      at: now,
    });
    if (!res.ok) continue;
    toClosed += 1;

    const noticePk = row.notice_pk == null ? null : Number(row.notice_pk);
    try {
      await removeProjection(db, noticePk);
      if (noticePk) {
        await db.query("UPDATE rfq_demand SET notice_pk = NULL WHERE id = ?", [demandId]);
      }
    } catch (err) {
      console.warn("[rfq-lifecycle] 撤下投影失败（下次对账兜底）:", (err as Error).message);
    }

    try {
      await notifyDemandExpired(db, {
        demandId,
        buyerUserId: Number(row.buyer_user_id),
        title: String(row.title ?? ""),
      });
    } catch (err) {
      console.warn("[rfq-lifecycle] 到期通知失败（不影响结案）:", (err as Error).message);
    }
  }

  return { toEvaluation, toClosed };
}
