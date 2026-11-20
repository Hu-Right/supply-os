/**
 * 采购需求 · 定标（RFQ P0）
 *
 * @module lib/services/procurement/awards
 *
 * @description 开标后由采购方定标：单家中标。定标与「响应置 evaluated / 标讯置 awarded /
 *              项目 closed(awarded) / 撤投影 / 审计事件」同事务；通知在提交后 best-effort。
 *              P0 不做评审打分（award_method=lowest_price），定标理由由采购方填写并对外公示。
 */
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  AWARD_KIND,
  PROJECT_CLOSE_REASON,
  PROJECT_STATUS,
  RESPONSE_STATUS,
  TENDER_STATUS,
} from "@/shared/constants/procurement";
import { transitionProjectWithin, type TxLike } from "./lifecycle";
import { loadLatestTender, loadProjectRow } from "./responses";
import { removeProjection } from "./projection";
import { deleteNoticeDocuments } from "@/lib/services/meilisearch/client";
import { pushNotificationSafe } from "@/lib/services/notifications";

export interface AwardRow extends RowDataPacket {
  id: number;
  project_id: number;
  version_no: number;
  tender_id: number;
  kind: string;
  response_id: number | null;
  supplier_id: number;
  amount: string | null;
  currency: string | null;
  reason: string;
  decided_by: number;
  created_at: number;
}

export type AwardResult =
  | { ok: true; awardId: number; supplierId: number; amount: string | null }
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "not_opened"
        | "award_exists"
        | "response_invalid"
        | "state_invalid";
    };

async function notifySupplier(
  db: Pool,
  input: { supplierId: number; type: string; link: string; projectId: number; payload: Record<string, unknown>; dedupeKey: string },
): Promise<void> {
  try {
    const [rows] = await db.query(
      "SELECT id FROM users WHERE supplier_id = ? AND supplier_link_status = 'verified' ORDER BY id LIMIT 1",
      [input.supplierId],
    );
    const userId = Number((rows as Array<{ id: number }>)[0]?.id ?? 0);
    if (!userId) return;
    await pushNotificationSafe(db, {
      userId,
      type: input.type,
      title: "",
      link: input.link,
      refId: input.projectId,
      payload: input.payload,
      dedupeKey: input.dedupeKey,
    });
  } catch (err) {
    console.warn("[procurement] 定标通知写入失败:", (err as Error).message);
  }
}

/**
 * 定标：仅「已开标（标讯 closed）」且响应仍为 submitted 时可定；同一项目/版本只允许一次 award。
 */
export async function awardResponse(
  db: Pool,
  input: { projectId: number; buyerUserId: number; responseId: number; reason: string; at?: number },
): Promise<AwardResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 10) return { ok: false, reason: "state_invalid" };

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [projRows] = await conn.query(
      `SELECT p.* FROM procurement_projects p
         JOIN procurement_buyers b ON b.id = p.buyer_id
        WHERE p.id = ? AND b.user_id = ? FOR UPDATE`,
      [input.projectId, input.buyerUserId],
    );
    const project = (projRows as Array<Record<string, unknown>>)[0];
    if (!project) {
      await conn.rollback();
      return { ok: false, reason: "forbidden" };
    }
    if (String(project.status) !== PROJECT_STATUS.PUBLISHED) {
      await conn.rollback();
      return { ok: false, reason: "state_invalid" };
    }

    const tender = await loadLatestTender(db, input.projectId);
    if (!tender) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (tender.status === TENDER_STATUS.PUBLISHED) {
      await conn.rollback();
      return { ok: false, reason: "not_opened" };
    }
    if (tender.status === TENDER_STATUS.AWARDED) {
      await conn.rollback();
      return { ok: false, reason: "award_exists" };
    }

    const [respRows] = await conn.query(
      "SELECT * FROM procurement_responses WHERE id = ? AND project_id = ? FOR UPDATE",
      [input.responseId, input.projectId],
    );
    const response = (respRows as Array<Record<string, unknown>>)[0];
    if (!response) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (String(response.status) !== RESPONSE_STATUS.SUBMITTED) {
      await conn.rollback();
      return { ok: false, reason: "response_invalid" };
    }

    const [dupRows] = await conn.query(
      "SELECT id FROM procurement_awards WHERE project_id = ? AND version_no = ? AND kind = 'award' LIMIT 1",
      [input.projectId, Number(project.version_no)],
    );
    if ((dupRows as RowDataPacket[]).length > 0) {
      await conn.rollback();
      return { ok: false, reason: "award_exists" };
    }

    const [sumRows] = await conn.query(
      "SELECT COALESCE(SUM(unit_price * quantity), 0) AS total FROM procurement_response_items WHERE response_id = ?",
      [input.responseId],
    );
    const total = Number((sumRows as Array<{ total: number | string }>)[0]?.total ?? 0);
    const amount = Number.isFinite(total) ? total.toFixed(2) : null;

    const [ins] = await conn.query<ResultSetHeader>(
      `INSERT INTO procurement_awards
         (project_id, version_no, tender_id, kind, response_id, supplier_id,
          amount, currency, reason, decided_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.projectId,
        Number(project.version_no),
        tender.id,
        AWARD_KIND.AWARD,
        input.responseId,
        Number(response.supplier_id),
        amount,
        String(response.currency ?? "CNY"),
        reason,
        input.buyerUserId,
        at,
      ],
    );
    const awardId = Number(ins.insertId);

    await conn.query("UPDATE procurement_responses SET status = 'evaluated', updated_at = ? WHERE id = ?", [
      at,
      input.responseId,
    ]);
    await conn.query("UPDATE procurement_tenders SET status = ? WHERE id = ?", [TENDER_STATUS.AWARDED, tender.id]);

    const moved = await transitionProjectWithin(conn as unknown as TxLike, {
      projectId: input.projectId,
      to: PROJECT_STATUS.CLOSED,
      actor: "buyer",
      actorId: input.buyerUserId,
      expectVersion: Number(project.version_no),
      closeReason: PROJECT_CLOSE_REASON.AWARDED,
      at,
    });
    if (!moved.ok) {
      await conn.rollback();
      return { ok: false, reason: "state_invalid" };
    }

    const noticePk = project.notice_pk == null ? null : Number(project.notice_pk);
    await removeProjection(conn as unknown as Pool, noticePk);
    if (noticePk) {
      await conn.query("UPDATE procurement_projects SET notice_pk = NULL WHERE id = ?", [input.projectId]);
      await deleteNoticeDocuments([noticePk]).catch((err: Error) => {
        console.warn("[procurement] 定标后删除搜索索引失败:", err.message);
      });
    }

    await conn.query(
      `INSERT INTO procurement_events
         (project_id, version_no, tender_id, response_id, actor_type, actor_id, kind, payload, created_at)
       VALUES (?, ?, ?, ?, 'buyer', ?, 'awarded', ?, ?)`,
      [
        input.projectId,
        Number(project.version_no),
        tender.id,
        input.responseId,
        input.buyerUserId,
        JSON.stringify({ awardId, supplierId: Number(response.supplier_id), amount, reason }),
        at,
      ],
    );

    await conn.commit();

    // 通知：中标 + 落选（best-effort）
    const [losers] = await db.query(
      `SELECT DISTINCT supplier_id FROM procurement_responses
        WHERE project_id = ? AND version_no = ? AND id <> ? AND status IN ('submitted','disqualified')`,
      [input.projectId, Number(project.version_no), input.responseId],
    );
    const link = `/rfq/${input.projectId}`;
    const reference = String(project.reference ?? "");
    await notifySupplier(db, {
      supplierId: Number(response.supplier_id),
      type: "procurement.awarded",
      link,
      projectId: input.projectId,
      payload: { reference, amount, currency: String(response.currency ?? "CNY") },
      dedupeKey: `procurement.awarded:${input.projectId}:v${Number(project.version_no)}:${Number(response.supplier_id)}`,
    });
    for (const row of losers as Array<{ supplier_id: number }>) {
      await notifySupplier(db, {
        supplierId: Number(row.supplier_id),
        type: "procurement.not_awarded",
        link,
        projectId: input.projectId,
        payload: { reference },
        dedupeKey: `procurement.not_awarded:${input.projectId}:v${Number(project.version_no)}:${Number(row.supplier_id)}`,
      });
    }

    return { ok: true, awardId, supplierId: Number(response.supplier_id), amount };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export interface AwardView {
  projectId: number;
  supplierId: number;
  company: string;
  amount: string | null;
  currency: string | null;
  reason: string;
  decidedAt: number;
  reference: string;
}

/** 定标结果（采购方/参与供应商可见） */
export async function getAward(db: Pool, projectId: number): Promise<AwardView | null> {
  const [rows] = await db.query(
    `SELECT a.project_id, a.supplier_id, a.amount, a.currency, a.reason, a.created_at,
            s.company, p.reference
       FROM procurement_awards a
       JOIN supplier s ON s.id = a.supplier_id
       JOIN procurement_projects p ON p.id = a.project_id
      WHERE a.project_id = ? AND a.kind = 'award'
      ORDER BY a.id DESC LIMIT 1`,
    [projectId],
  );
  const row = (rows as Array<Record<string, unknown>>)[0];
  if (!row) return null;
  return {
    projectId: Number(row.project_id),
    supplierId: Number(row.supplier_id),
    company: String(row.company ?? ""),
    amount: row.amount == null ? null : String(row.amount),
    currency: row.currency == null ? null : String(row.currency),
    reason: String(row.reason ?? ""),
    decidedAt: Number(row.created_at),
    reference: String(row.reference ?? ""),
  };
}

/** 公开中标公示：只在中标后返回最小信息集 */
export async function getPublicAward(db: Pool, projectId: number): Promise<AwardView | null> {
  const project = await loadProjectRow(db, projectId);
  if (!project || project.status !== PROJECT_STATUS.CLOSED) return null;
  return getAward(db, projectId);
}