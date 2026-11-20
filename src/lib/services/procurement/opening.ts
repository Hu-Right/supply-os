/**
 * 采购需求 · 截止收标与超期结案（RFQ P0）
 *
 * @module lib/services/procurement/opening
 *
 * @description 两条时间驱动动作，由 lifecycle timers 每 10 分钟调用：
 *              ① openDueTenders：到截止 → 标讯 closed + 写开标时间 + 投影置 closed +
 *                 审计事件 + 通知采购方；**项目保持 published**，留给采购方比价定标。
 *              ② expireUnawardedTenders：开标后超过 AWARD_GRACE_DAYS 仍未定标 → 项目
 *                 closed/expired，撤投影并清索引，避免无效需求长期挂在检索面上。
 *
 *              这是对旧 expireDueTenders（截止即结案）的语义修正：旧口径没有比价窗口。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  AWARD_GRACE_DAYS,
  PROJECT_CLOSE_REASON,
  PROJECT_STATUS,
  TENDER_STATUS,
} from "@/shared/constants/procurement";
import { transitionProject } from "./lifecycle";
import { markProjectionClosed, removeProjection } from "./projection";
import { deleteNoticeDocuments } from "@/lib/services/meilisearch/client";
import { pushNotificationSafe } from "@/lib/services/notifications";

interface DueTenderRow extends RowDataPacket {
  project_id: number;
  notice_pk: number | null;
  tender_id: number;
  version_no: number;
  deadline_at: number | null;
}

async function notifyBuyer(
  db: Pool,
  projectId: number,
  n: { type: string; payload: Record<string, unknown>; dedupeKey: string },
): Promise<void> {
  try {
    const [rows] = await db.query(
      `SELECT b.user_id, p.reference FROM procurement_projects p
         JOIN procurement_buyers b ON b.id = p.buyer_id
        WHERE p.id = ? LIMIT 1`,
      [projectId],
    );
    const buyer = (rows as Array<{ user_id: number | null; reference: string }>)[0];
    if (!buyer?.user_id) return;
    await pushNotificationSafe(db, {
      userId: Number(buyer.user_id),
      type: n.type,
      title: "",
      link: `/rfq/${projectId}/publish`,
      refId: projectId,
      payload: { reference: buyer.reference, projectId, ...n.payload },
      dedupeKey: n.dedupeKey,
    });
  } catch (err) {
    console.warn("[procurement] 截止/结案通知写入失败:", (err as Error).message);
  }
}

/**
 * 到截止收标开标（幂等：只处理仍为 published 的标讯）。
 * @returns 本轮处理的标讯数
 */
export async function openDueTenders(db: Pool, at = Math.floor(Date.now() / 1000)): Promise<number> {
  const [rows] = await db.query(
    `SELECT p.id AS project_id, p.notice_pk, t.id AS tender_id, t.version_no, t.deadline_at
       FROM procurement_projects p
       JOIN procurement_tenders t ON t.id = (
         SELECT MAX(t2.id) FROM procurement_tenders t2 WHERE t2.project_id = p.id
       )
      WHERE p.status = 'published'
        AND t.status = 'published'
        AND t.deadline_at IS NOT NULL
        AND t.deadline_at > 0
        AND t.deadline_at <= ?
      ORDER BY t.deadline_at
      LIMIT 200`,
    [at],
  );
  let opened = 0;
  for (const row of rows as DueTenderRow[]) {
    const [upd] = await db.query(
      "UPDATE procurement_tenders SET status = ?, opened_ts = ? WHERE id = ? AND status = ?",
      [TENDER_STATUS.CLOSED, at, row.tender_id, TENDER_STATUS.PUBLISHED],
    );
    if (Number((upd as { affectedRows?: number }).affectedRows ?? 0) === 0) continue;

    const [cntRows] = await db.query(
      "SELECT COUNT(*) AS c FROM procurement_responses WHERE project_id = ? AND version_no = ? AND status = 'submitted'",
      [row.project_id, row.version_no],
    );
    const responseCount = Number((cntRows as Array<{ c: number }>)[0]?.c ?? 0);

    if (row.notice_pk != null) {
      await markProjectionClosed(db, Number(row.notice_pk), at).catch((err: Error) => {
        console.warn("[procurement] 截止后投影置 closed 失败（继续）:", err.message);
      });
    }

    await db.query(
      `INSERT INTO procurement_events
         (project_id, version_no, tender_id, actor_type, kind, payload, created_ts)
       VALUES (?, ?, ?, 'system', 'opened', ?, ?)`,
      [row.project_id, row.version_no, row.tender_id, JSON.stringify({ responseCount }), at],
    );

    await notifyBuyer(db, Number(row.project_id), {
      type: "procurement.opened",
      payload: { tenderId: Number(row.tender_id), responseCount },
      dedupeKey: `procurement.opened:${row.project_id}:v${row.version_no}`,
    });
    opened++;
  }
  return opened;
}

/**
 * 开标后超期未定标 → 项目结案（默认 30 天）。
 * @returns 本轮结案的项目数
 */
export async function expireUnawardedTenders(
  db: Pool,
  at = Math.floor(Date.now() / 1000),
  graceDays = AWARD_GRACE_DAYS,
): Promise<number> {
  const cutoff = at - Math.max(1, graceDays) * 86_400;
  const [rows] = await db.query(
    `SELECT p.id AS project_id, p.notice_pk, t.id AS tender_id, t.version_no, t.opened_ts
       FROM procurement_projects p
       JOIN procurement_tenders t ON t.id = (
         SELECT MAX(t2.id) FROM procurement_tenders t2 WHERE t2.project_id = p.id
       )
      WHERE p.status = 'published'
        AND t.status = ?
        AND t.opened_ts IS NOT NULL
        AND t.opened_ts <= ?
        AND NOT EXISTS (
          SELECT 1 FROM procurement_awards a WHERE a.project_id = p.id AND a.kind = 'award'
        )
      ORDER BY t.opened_ts
      LIMIT 200`,
    [TENDER_STATUS.CLOSED, cutoff],
  );

  let closed = 0;
  for (const row of rows as DueTenderRow[]) {
    const moved = await transitionProject(db, {
      projectId: Number(row.project_id),
      to: PROJECT_STATUS.CLOSED,
      actor: "system",
      actorId: null,
      closeReason: PROJECT_CLOSE_REASON.EXPIRED,
      at,
    });
    if (!moved.ok) continue;

    await removeProjection(db, row.notice_pk == null ? null : Number(row.notice_pk));
    if (row.notice_pk != null) {
      await deleteNoticeDocuments([Number(row.notice_pk)]).catch((err: Error) => {
        console.warn("[procurement] 超期结案后删除搜索索引失败:", err.message);
      });
      await db.query("UPDATE procurement_projects SET notice_pk = NULL WHERE id = ?", [row.project_id]);
    }
    await db.query("UPDATE procurement_tenders SET status = ? WHERE id = ?", [TENDER_STATUS.CANCELLED, row.tender_id]);
    await db.query(
      `INSERT INTO procurement_events
         (project_id, version_no, tender_id, actor_type, kind, payload, created_ts)
       VALUES (?, ?, ?, 'system', 'closed', ?, ?)`,
      [row.project_id, row.version_no, row.tender_id, JSON.stringify({ reason: PROJECT_CLOSE_REASON.EXPIRED, graceDays }), at],
    );
    await notifyBuyer(db, Number(row.project_id), {
      type: "procurement.expired",
      payload: { tenderId: Number(row.tender_id) },
      dedupeKey: `procurement.expired:${row.project_id}:v${row.version_no}`,
    });
    closed++;
  }
  return closed;
}