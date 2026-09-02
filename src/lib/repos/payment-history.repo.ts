/**
 * 支付历史查询数据访问层
 * Payment History Repository
 *
 * @module repos/payment-history.repo
 * @description ARCH-P4b（2026-09-01）：从 payments.repo.ts 拆出的查询视图聚合。
 *              操作 crm_payment_orders + crm_opportunity_unlocks LEFT JOIN 公告摘要，
 *              供「我的记录」面板（订单历史 + 解锁历史）使用。
 *
 *              与 PaymentsRepo（订单 CRUD + 履约事务）职责分离：
 *              PaymentsRepo 负责写，PaymentHistoryRepo 负责读。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { PaymentOrderRow } from "./types";

/** 订单历史查询行（订单 LEFT JOIN 公告，供列表映射） */
export interface OrderHistoryRow extends PaymentOrderRow {
  external_notice_id: string | null;
  source_channel: string | null;
  reference: string | null;
  title: string | null;
  notice_type: string | null;
  agency: string | null;
  agency_full: string | null;
  country: string | null;
  deadline: string | null;
  urgency: string | null;
  url: string | null;
  industry: string | null;
}

/** 解锁历史查询行（解锁 LEFT JOIN 公告 [+ 译文]，供列表映射与后台补翻） */
export interface UnlockHistoryRow {
  user_key: string;
  notice_id: number | null;
  unlock_type: string;
  price: number;
  unlocked_at: Date;
  external_notice_id: string | null;
  source_channel: string | null;
  reference: string | null;
  title: string | null;
  title_i18n?: string | null;
  notice_type: string | null;
  agency: string | null;
  agency_full: string | null;
  country: string | null;
  deadline: string | null;
  deadline_ts: number | null;
  urgency: string | null;
  url: string | null;
  industry: string | null;
  description?: string | null;
}

export class PaymentHistoryRepo {
  constructor(private pool: Pool) {}

  /** 订单历史总数（可选状态过滤） */
  async countOrders(userKey: string, status: string): Promise<number> {
    const params: unknown[] = [userKey];
    let where = "WHERE o.user_key = ?";
    if (status) {
      where += " AND o.status = ?";
      params.push(status);
    }
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS total
       FROM crm_payment_orders o
       ${where}`,
      params,
    );
    return Number((rows as RowDataPacket[])[0]?.total || 0);
  }

  /** 订单历史分页（订单 LEFT JOIN 公告摘要） */
  async listOrders(userKey: string, status: string, limit: number, offset: number): Promise<OrderHistoryRow[]> {
    const params: unknown[] = [userKey];
    let where = "WHERE o.user_key = ?";
    if (status) {
      where += " AND o.status = ?";
      params.push(status);
    }
    params.push(limit, offset);
    const [rows] = await this.pool.query(
      `SELECT
         o.order_no, o.user_key, o.provider, o.plan_code, o.notice_id, o.amount, o.currency,
         o.status, o.provider_trade_no, o.paid_at, o.created_at, o.updated_at,
         n.notice_id AS external_notice_id, n.source_channel, n.reference, n.title,
         n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.urgency, n.url, n.industry
       FROM crm_payment_orders o
       LEFT JOIN crm_bid_notices n ON n.id = o.notice_id
       ${where}
       ORDER BY o.id DESC
       LIMIT ? OFFSET ?`,
      params,
    );
    return rows as OrderHistoryRow[];
  }

  /** 解锁历史总数（仅公告解锁） */
  async countUnlocks(userKey: string): Promise<number> {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS total
       FROM crm_opportunity_unlocks u
       WHERE u.user_key = ? AND u.notice_id IS NOT NULL`,
      [userKey],
    );
    return Number((rows as RowDataPacket[])[0]?.total || 0);
  }

  /**
   * 解锁历史分页（解锁 LEFT JOIN 公告 [+ 译文]）。
   * withTranslation 为 true 时多取 n.description（仅供后台补翻用，不返回）与缓存译文标题。
   */
  async listUnlocks(
    userKey: string,
    limit: number,
    offset: number,
    withTranslation: { lang: string } | null,
  ): Promise<UnlockHistoryRow[]> {
    const [rows] = await this.pool.query(
      withTranslation
        ? `SELECT
             u.user_key, u.notice_id, u.unlock_type, u.price, u.unlocked_at,
             n.notice_id AS external_notice_id, n.source_channel, n.reference, n.title,
             n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.deadline_ts, n.urgency, n.url, n.industry,
             n.description, tr.title_tr AS title_i18n
           FROM crm_opportunity_unlocks u
           LEFT JOIN crm_bid_notices n ON n.id = u.notice_id
           LEFT JOIN crm_notice_translations tr ON tr.notice_id = u.notice_id AND tr.lang = ?
           WHERE u.user_key = ? AND u.notice_id IS NOT NULL
           ORDER BY u.id DESC
           LIMIT ? OFFSET ?`
        : `SELECT
             u.user_key, u.notice_id, u.unlock_type, u.price, u.unlocked_at,
             n.notice_id AS external_notice_id, n.source_channel, n.reference, n.title,
             n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.deadline_ts, n.urgency, n.url, n.industry
           FROM crm_opportunity_unlocks u
           LEFT JOIN crm_bid_notices n ON n.id = u.notice_id
           WHERE u.user_key = ? AND u.notice_id IS NOT NULL
           ORDER BY u.id DESC
           LIMIT ? OFFSET ?`,
      withTranslation ? [withTranslation.lang, userKey, limit, offset] : [userKey, limit, offset],
    );
    return rows as UnlockHistoryRow[];
  }

  /** 公告译文缓存 upsert（后台补翻落库） */
  async upsertNoticeTranslation(noticeId: number, lang: string, titleTr: string, descriptionTr: string, model: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), description_tr = VALUES(description_tr), model = VALUES(model)`,
      [noticeId, lang, titleTr, descriptionTr, model],
    );
  }
}
