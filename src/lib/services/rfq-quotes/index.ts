/**
 * RFQ 报价服务（资格闸口 + 报价读写 + 选定）
 *
 * @module lib/services/rfq-quotes
 * @description 闭环后半段（⑦报价 → ⑧比价 → ⑩选定）的数据面。报价密封：供应商只见己方、
 *              采购方（创建者）见全部。选定/中标以 crm_rfq_quotes.status 表达，不改 rfq_status。
 *              资格：已认证企业（crm_users.supplier_link_status='verified' 且绑定 supplier）
 *              + RFQ 为 platform/published + 未过 deadline + (public 或 targeted 且在邀约名单)。
 */
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { RFQ_STATUS, QUOTE_STATUS } from "@/shared/constants/rfq";
import { pushNotification } from "@/lib/services/notifications";

export interface QuoteableRfq {
  id: number;
  userId: number;
  status: string;
  visibility: string;
  deadlineSec: number;
  title: string;
}

export interface Eligibility {
  ok: boolean;
  /** not_found | not_open | expired | not_invited | not_supplier | awarded */
  reason?: string;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** 是否已认证企业供应商（绑定 supplier 且关联 verified，账号未被停用/拒绝）。 */
export async function isVerifiedSupplier(dbPool: Pool, userId: number): Promise<boolean> {
  const [rows] = await dbPool.query(
    `SELECT supplier_link_status, supplier_id, account_status
       FROM crm_users WHERE id = ? LIMIT 1`,
    [userId],
  );
  const u = (rows as RowDataPacket[])[0];
  if (!u) return false;
  const account = String(u.account_status || "");
  if (account === "disabled" || account === "rejected") return false;
  return String(u.supplier_link_status) === "verified" && u.supplier_id != null;
}

/** 取可报价的 RFQ 主行（platform/RFQ）；不存在返回 null。 */
export async function getQuoteableRfq(dbPool: Pool, rfqId: number): Promise<QuoteableRfq | null> {
  const [rows] = await dbPool.query(
    `SELECT id, user_id, rfq_status, visibility, deadline_sec, title
       FROM crm_bid_notices
      WHERE id = ? AND notice_type = 'RFQ' AND entry_source = 'platform'
      LIMIT 1`,
    [rfqId],
  );
  const r = (rows as RowDataPacket[])[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    userId: r.user_id == null ? 0 : Number(r.user_id),
    status: String(r.rfq_status || ""),
    visibility: String(r.visibility || "public"),
    deadlineSec: Number(r.deadline_sec) || 0,
    title: String(r.title || ""),
  };
}

/** 报价资格判定（认证 + 开放 + 截止 + 可见性/邀约）。 */
export async function checkQuoteEligibility(
  dbPool: Pool,
  rfq: QuoteableRfq | null,
  userId: number,
): Promise<Eligibility> {
  if (!rfq) return { ok: false, reason: "not_found" };
  if (rfq.status !== RFQ_STATUS.PUBLISHED) return { ok: false, reason: "not_open" };
  if (rfq.deadlineSec !== 0 && rfq.deadlineSec < nowSec()) return { ok: false, reason: "expired" };

  if (!(await isVerifiedSupplier(dbPool, userId))) return { ok: false, reason: "not_supplier" };

  if (rfq.visibility === "targeted") {
    const [rows] = await dbPool.query(
      `SELECT 1 FROM crm_rfq_invites WHERE rfq_id = ? AND supplier_user_id = ? LIMIT 1`,
      [rfq.id, userId],
    );
    if ((rows as RowDataPacket[]).length === 0) return { ok: false, reason: "not_invited" };
  }

  // 已完成供应商选定（存在 won 报价）→ 封停报价：避免 ODKU 把 won 覆盖回 submitted 并重复通知
  const [awarded] = await dbPool.query(
    `SELECT 1 FROM crm_rfq_quotes WHERE rfq_id = ? AND status = ? LIMIT 1`,
    [rfq.id, QUOTE_STATUS.WON],
  );
  if ((awarded as RowDataPacket[]).length > 0) return { ok: false, reason: "awarded" };

  return { ok: true };
}

export interface SubmitQuoteInput {
  rfqId: number;
  userId: number;
  price: number;
  currency: string;
  leadTimeDays?: number | null;
  deliveryTerms?: string | null;
  note?: string | null;
  buyerUserId: number;
  rfqTitle: string;
}

/** 提交/更新报价（一供应商一有效报价，upsert）。best-effort 通知采购方收到报价。 */
export async function submitQuote(
  dbPool: Pool,
  input: SubmitQuoteInput,
): Promise<{ quoteId: number }> {
  const [result] = await dbPool.query(
    `INSERT INTO crm_rfq_quotes
       (rfq_id, supplier_user_id, price, currency, lead_time_days, delivery_terms, note, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       price = VALUES(price), currency = VALUES(currency),
       lead_time_days = VALUES(lead_time_days), delivery_terms = VALUES(delivery_terms),
       note = VALUES(note), status = VALUES(status)`,
    [
      input.rfqId,
      input.userId,
      input.price,
      input.currency,
      input.leadTimeDays ?? null,
      input.deliveryTerms ?? null,
      input.note ?? null,
      QUOTE_STATUS.SUBMITTED,
    ],
  );
  const quoteId = (result as ResultSetHeader).insertId;

  // 通知采购方（失败不阻断报价落库）
  try {
    await pushNotification(dbPool, {
      userId: input.buyerUserId,
      type: "rfq_quoted",
      title: `收到一条新报价：${input.rfqTitle}`.slice(0, 200),
      body: `报价金额 ${input.price} ${input.currency}`,
      link: `/rfq/${input.rfqId}`,
      refId: input.rfqId,
    });
  } catch (e) {
    console.warn("[rfq-quotes] 报价通知失败（不影响报价落库）:", (e as Error).message);
  }

  return { quoteId };
}

/** 采购方查看该 RFQ 全部有效报价（密封：仅路由层校验为创建者后调用；按价升序）。 */
export async function listQuotesForBuyer(
  dbPool: Pool,
  rfqId: number,
): Promise<
  Array<{
    id: number;
    supplierUserId: number;
    company: string;
    price: number;
    currency: string;
    leadTimeDays: number | null;
    deliveryTerms: string;
    note: string;
    status: string;
    createdAt: string;
  }>
> {
  const [rows] = await dbPool.query(
    `SELECT q.id, q.supplier_user_id, s.company, q.price, q.currency,
            q.lead_time_days, q.delivery_terms, q.note, q.status, q.created_at
       FROM crm_rfq_quotes q
       LEFT JOIN crm_users u ON u.id = q.supplier_user_id
       LEFT JOIN supplier s ON s.id = u.supplier_id
      WHERE q.rfq_id = ? AND q.status <> ?
      ORDER BY q.price ASC`,
    [rfqId, QUOTE_STATUS.WITHDRAWN],
  );
  return (rows as RowDataPacket[]).map((r) => ({
    id: Number(r.id),
    supplierUserId: Number(r.supplier_user_id),
    company: String(r.company || ""),
    price: Number(r.price) || 0,
    currency: String(r.currency || "CNY"),
    leadTimeDays: r.lead_time_days == null ? null : Number(r.lead_time_days),
    deliveryTerms: String(r.delivery_terms || ""),
    note: String(r.note || ""),
    status: String(r.status || QUOTE_STATUS.SUBMITTED),
    createdAt: r.created_at != null ? String(r.created_at) : "",
  }));
}

/** 供应商查自己的报价（含撤回）。 */
export async function getOwnQuote(
  dbPool: Pool,
  rfqId: number,
  userId: number,
): Promise<{ id: number; status: string } | null> {
  const [rows] = await dbPool.query(
    `SELECT id, status FROM crm_rfq_quotes WHERE rfq_id = ? AND supplier_user_id = ? LIMIT 1`,
    [rfqId, userId],
  );
  const r = (rows as RowDataPacket[])[0];
  if (!r) return null;
  return { id: Number(r.id), status: String(r.status) };
}

/** 供应商撤回自己的 submitted 报价。返回是否命中。 */
export async function withdrawQuote(dbPool: Pool, quoteId: number, userId: number): Promise<boolean> {
  const [result] = await dbPool.query(
    `UPDATE crm_rfq_quotes SET status = ?
      WHERE id = ? AND supplier_user_id = ? AND status = ?`,
    [QUOTE_STATUS.WITHDRAWN, quoteId, userId, QUOTE_STATUS.SUBMITTED],
  );
  return (result as ResultSetHeader).affectedRows > 0;
}

export interface AwardResult {
  ok: boolean;
  /** not_found | forbidden | no_winner */
  reason?: string;
  winnerSupplierUserId?: number;
  rejectedCount?: number;
}

/**
 * 选定中标（仅采购方）：事务内中标者置 won、其余 submitted 置 rejected；best-effort 通知中标供应商。
 * 不改 rfq_status（保持 published 可搜，见 spec §1/§9）。
 */
export async function awardQuote(
  dbPool: Pool,
  opts: { rfqId: number; winnerQuoteId: number; buyerUserId: number },
): Promise<AwardResult> {
  const conn: PoolConnection = await dbPool.getConnection();
  try {
    await conn.beginTransaction();

    const [rf] = await conn.query(
      `SELECT user_id FROM crm_bid_notices
        WHERE id = ? AND notice_type = 'RFQ' AND entry_source = 'platform' LIMIT 1`,
      [opts.rfqId],
    );
    const rfqRow = (rf as RowDataPacket[])[0];
    if (!rfqRow) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (Number(rfqRow.user_id) !== opts.buyerUserId) {
      await conn.rollback();
      return { ok: false, reason: "forbidden" };
    }

    const [wq] = await conn.query(
      `SELECT supplier_user_id FROM crm_rfq_quotes
        WHERE id = ? AND rfq_id = ? AND status = ? LIMIT 1`,
      [opts.winnerQuoteId, opts.rfqId, QUOTE_STATUS.SUBMITTED],
    );
    const winner = (wq as RowDataPacket[])[0];
    if (!winner) {
      await conn.rollback();
      return { ok: false, reason: "no_winner" };
    }
    const winnerSupplierUserId = Number(winner.supplier_user_id);

    await conn.query(
      `UPDATE crm_rfq_quotes SET status = ? WHERE id = ? AND rfq_id = ?`,
      [QUOTE_STATUS.WON, opts.winnerQuoteId, opts.rfqId],
    );
    const [rej] = await conn.query(
      `UPDATE crm_rfq_quotes SET status = ?
        WHERE rfq_id = ? AND id <> ? AND status = ?`,
      [QUOTE_STATUS.REJECTED, opts.rfqId, opts.winnerQuoteId, QUOTE_STATUS.SUBMITTED],
    );
    const rejectedCount = (rej as ResultSetHeader).affectedRows;

    await conn.commit();

    try {
      await pushNotification(dbPool, {
        userId: winnerSupplierUserId,
        type: "rfq_won",
        title: "恭喜：你在一条采购需求中中选",
        link: `/rfq/${opts.rfqId}`,
        refId: opts.rfqId,
      });
    } catch (e) {
      console.warn("[rfq-quotes] 中选通知失败（不影响选定落库）:", (e as Error).message);
    }

    return { ok: true, winnerSupplierUserId, rejectedCount };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* 回滚失败不覆盖原错误 */
    }
    throw e;
  } finally {
    conn.release();
  }
}

export interface MyQuoteRow {
  quoteId: number;
  rfqId: number;
  title: string;
  reference: string;
  rfqStatus: string;
  price: number;
  currency: string;
  leadTimeDays: number | null;
  quoteStatus: string;
  deadlineSec: number;
  updatedAt: string;
}

/** 供应商视角：列出本人全部有效报价（含对应 RFQ 标题/状态），按更新倒序。 */
export async function listMyQuotes(dbPool: Pool, userId: number): Promise<MyQuoteRow[]> {
  const [rows] = await dbPool.query(
    `SELECT q.id AS quoteId, q.rfq_id AS rfqId, q.price, q.currency,
            q.lead_time_days AS leadTimeDays, q.status AS quoteStatus, q.updated_at AS updatedAt,
            n.title, n.reference, n.rfq_status AS rfqStatus, n.deadline_sec AS deadlineSec
       FROM crm_rfq_quotes q
       JOIN crm_bid_notices n ON n.id = q.rfq_id
      WHERE q.supplier_user_id = ? AND q.status <> ?
      ORDER BY q.id DESC`,
    [userId, QUOTE_STATUS.WITHDRAWN],
  );
  return (rows as RowDataPacket[]).map((r) => ({
    quoteId: Number(r.quoteId),
    rfqId: Number(r.rfqId),
    title: String(r.title || ""),
    reference: String(r.reference || ""),
    rfqStatus: String(r.rfqStatus || ""),
    price: Number(r.price) || 0,
    currency: String(r.currency || "CNY"),
    leadTimeDays: r.leadTimeDays == null ? null : Number(r.leadTimeDays),
    quoteStatus: String(r.quoteStatus || QUOTE_STATUS.SUBMITTED),
    deadlineSec: Number(r.deadlineSec) || 0,
    updatedAt: r.updatedAt != null ? String(r.updatedAt) : "",
  }));
}
