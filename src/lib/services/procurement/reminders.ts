/**
 * 采购需求 · 截止前提醒（发布侧生命周期补强 2026-11-28）
 *
 * @module lib/services/procurement/reminders
 *
 * @description 截止收标前 T-72h / T-24h 各提醒一次（含当前已收报价份数），由 lifecycle
 *              timers 的 RFQ 生命周期轮（每 10 分钟）随开标/结案扫描一起调用。背景：
 *              开标（opened）与超期结案（expired）都有站内信，但都是「事后信」——采购方
 *              忘了自己填的截止时间时，需求会静默滑向到期开标 → 超期未定标 → 结案撤投影，
 *              全程没有干预点。提醒把干预点插在滑轨中段（发布完成率的直接杠杆）。
 *
 *              幂等：notifications.dedupe_key 唯一键（ER_DUP_ENTRY=已发过，pushNotification
 *              返回 0），不写 procurement_events——提醒不是状态变更，不进审计流。
 *              dedupeKey 含截止时刻（tender:stage:deadlineAt），截止被延长后新截止进入
 *              窗口会重新提醒。两档窗口互斥（72h 档要求截止仍晚于 now+24h），同一轮不双发；
 *              若服务停机越过整档窗口，该档跳过、下一档兜底（宁缺毋滥）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { pushNotificationSafe } from "@/lib/services/notifications";

/** 提醒档位：窗口提前量（秒）与文案用小时数；两档窗口互斥由查询下界保证 */
const REMINDER_STAGES = [
  { key: "72h", windowSec: 72 * 3600, hours: 72, lowerSec: 24 * 3600 },
  { key: "24h", windowSec: 24 * 3600, hours: 24, lowerSec: 0 },
] as const;

interface ReminderTenderRow extends RowDataPacket {
  project_id: number;
  tender_id: number;
  version_no: number;
  deadline_at: number;
}

/** @returns 实际写入条数（dedupeKey 命中=0；收件人缺失=0；写库失败=0） */
async function notifyBuyer(
  db: Pool,
  projectId: number,
  n: { payload: Record<string, unknown>; dedupeKey: string },
): Promise<number> {
  try {
    const [rows] = await db.query(
      `SELECT b.user_id, p.reference FROM procurement_projects p
         JOIN procurement_buyers b ON b.id = p.buyer_id
        WHERE p.id = ? LIMIT 1`,
      [projectId],
    );
    const buyer = (rows as Array<{ user_id: number | null; reference: string }>)[0];
    if (!buyer?.user_id) return 0;
    const insertId = await pushNotificationSafe(db, {
      userId: Number(buyer.user_id),
      type: "procurement.deadline_reminder",
      title: "",
      link: `/rfq/${projectId}/publish`,
      refId: projectId,
      payload: { reference: buyer.reference, projectId, ...n.payload },
      dedupeKey: n.dedupeKey,
    });
    return insertId > 0 ? 1 : 0;
  } catch (err) {
    console.warn("[procurement] 截止前提醒写入失败:", (err as Error).message);
    return 0;
  }
}

/**
 * 截止前提醒扫描（幂等，可安全重复执行）。
 * @returns 本轮实际发出的提醒数（重复投递不计，dedupeKey 命中返回 0）
 */
export async function remindDueDeadlines(db: Pool, at = Math.floor(Date.now() / 1000)): Promise<number> {
  let sent = 0;
  for (const stage of REMINDER_STAGES) {
    const [rows] = await db.query(
      `SELECT p.id AS project_id, t.id AS tender_id, t.version_no, t.deadline_at
         FROM procurement_projects p
         JOIN procurement_tenders t ON t.id = (
           SELECT MAX(t2.id) FROM procurement_tenders t2 WHERE t2.project_id = p.id
         )
        WHERE p.status = 'published'
          AND t.status = 'published'
          AND t.deadline_at IS NOT NULL
          AND t.deadline_at > 0
          AND t.deadline_at > ?
          AND t.deadline_at <= ?
        ORDER BY t.deadline_at
        LIMIT 200`,
      [at + stage.lowerSec, at + stage.windowSec],
    );

    for (const row of rows as ReminderTenderRow[]) {
      const [cntRows] = await db.query(
        "SELECT COUNT(*) AS c FROM procurement_responses WHERE project_id = ? AND version_no = ? AND status = 'submitted'",
        [row.project_id, row.version_no],
      );
      const responseCount = Number((cntRows as Array<{ c: number }>)[0]?.c ?? 0);
      sent += await notifyBuyer(db, Number(row.project_id), {
        payload: {
          tenderId: Number(row.tender_id),
          responseCount,
          hours: stage.hours,
        },
        dedupeKey: `procurement.deadline_reminder:${row.tender_id}:${stage.key}:${row.deadline_at}`,
      });
    }
  }
  return sent;
}
