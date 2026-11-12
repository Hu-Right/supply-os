/**
 * 支付历史查询数据访问层
 * Payment History Repository
 *
 * @module repos/payment-history.repo
 * @description ARCH-P4b（2026-09-01）：从 payments.repo.ts 拆出的查询视图聚合。
 *              订单侧读统一表 orders；解锁侧 opportunity_unlocks LEFT JOIN 公告摘要，
 *              供「我的记录」面板（订单历史 + 解锁历史）使用。
 *
 *              与 PaymentsRepo（订单 CRUD + 履约事务）职责分离：
 *              PaymentsRepo 负责写，PaymentHistoryRepo 负责读。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

/**
 * 订单历史查询行（订单 LEFT JOIN 公告，供列表映射）。
 * 列口径以云库为准：bid_notices 无 source_channel/urgency（见 ADR-0012），
 * 查询不得引用内网库独有的列，否则线上 500。
 */
/**
 * 订单历史行（统一表 `orders` 的原样投影）。
 *
 * 2026-11-12 起四种业务订单同表，历史列表不再需要四路查询 + 内存归并：
 * `product_kind` 直接给出业务类型，`product_code` 由调用方按需还原成旧码形。
 */
export interface UnifiedOrderHistoryRow {
  order_no: string;
  user_id: number;
  product_kind: string;
  product_code: string;
  amount: string;
  currency: string;
  status: string;
  provider: string;
  provider_trade_no: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
  expires_at: Date | null;
}

/** 解锁历史查询行（解锁 LEFT JOIN 公告 [+ 译文]，供列表映射与后台补翻） */
export interface UnlockHistoryRow {
  user_id: number;
  notice_id: number | null;
  unlock_type: string;
  price: number;
  unlocked_at: Date;
  external_notice_id: string | null;
  reference: string | null;
  title: string | null;
  title_i18n?: string | null;
  title_cn?: string | null;
  notice_type: string | null;
  agency: string | null;
  agency_full: string | null;
  country: string | null;
  deadline: string | null;
  deadline_ts: number | null;
  url: string | null;
  industry: string | null;
  description?: string | null;
}

export class PaymentHistoryRepo {
  constructor(private pool: Pool) {}

  /** 订单历史总数（可选状态过滤；四种业务同表，无需再相加） */
  async countOrders(userId: number, status: string): Promise<number> {
    const params: unknown[] = [userId];
    let where = "WHERE user_id = ?";
    if (status) {
      where += " AND status = ?";
      params.push(status);
    }
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS total FROM orders ${where}`,
      params,
    );
    return Number((rows as RowDataPacket[])[0]?.total || 0);
  }

  /**
   * 订单历史分页（统一表直接分页）。
   *
   * 原实现是「四表各拉全量 → 内存合并排序 → slice」，会员侧还固定拉 9999 行；
   * 合一表后这里就是一次带 LIMIT/OFFSET 的查询，`created_at + id` 双键保证翻页稳定。
   *
   * 顺带删掉原来的 `LEFT JOIN bid_notices`：它取回来的 9 个公告列在归一映射里
   * 全被丢弃（`normalizeOrder` 只读订单自身字段），从未上网。要展示公告摘要应另开
   * 接口，而不是在每个订单行上挂一份无人消费的联表结果。
   */
  async listOrders(userId: number, status: string, limit: number, offset: number): Promise<UnifiedOrderHistoryRow[]> {
    const params: unknown[] = [userId];
    let where = "WHERE user_id = ?";
    if (status) {
      where += " AND status = ?";
      params.push(status);
    }
    params.push(limit, offset);
    const [rows] = await this.pool.query(
      `SELECT order_no, user_id, product_kind, product_code, amount, currency, status, provider,
              provider_trade_no, paid_at, created_at, updated_at, expires_at
         FROM orders ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
      params,
    );
    return rows as UnifiedOrderHistoryRow[];
  }

  /** 解锁历史总数（仅公告解锁） */
  async countUnlocks(userId: number): Promise<number> {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS total
       FROM opportunity_unlocks u
       WHERE u.user_id = ? AND u.notice_id IS NOT NULL`,
      [userId],
    );
    return Number((rows as RowDataPacket[])[0]?.total || 0);
  }

  /**
   * 解锁历史分页（解锁 LEFT JOIN 公告 [+ 译文]）。
   * withTranslation 为 true 时多取 n.description（仅供后台补翻用，不返回）与缓存译文标题。
   */
  async listUnlocks(
    userId: number,
    limit: number,
    offset: number,
    withTranslation: { lang: string } | null,
  ): Promise<UnlockHistoryRow[]> {
    const [rows] = await this.pool.query(
      withTranslation
        ? `SELECT
             u.user_id, u.notice_id, u.unlock_type, u.price, u.unlocked_at,
             n.notice_id AS external_notice_id, n.reference, n.title,
             n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.deadline_ts, n.url, n.industry,
             n.description, tr.title_tr AS title_i18n, np.title_cn
           FROM opportunity_unlocks u
           LEFT JOIN bid_notices n ON n.id = u.notice_id
           LEFT JOIN notice_public np ON np.notice_pk = u.notice_id
           LEFT JOIN notice_translations tr ON tr.notice_id = u.notice_id AND tr.lang = ?
           WHERE u.user_id = ? AND u.notice_id IS NOT NULL
           ORDER BY u.id DESC
           LIMIT ? OFFSET ?`
        : `SELECT
             u.user_id, u.notice_id, u.unlock_type, u.price, u.unlocked_at,
             n.notice_id AS external_notice_id, n.reference, n.title,
             n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.deadline_ts, n.url, n.industry,
             np.title_cn
           FROM opportunity_unlocks u
           LEFT JOIN bid_notices n ON n.id = u.notice_id
           LEFT JOIN notice_public np ON np.notice_pk = u.notice_id
           WHERE u.user_id = ? AND u.notice_id IS NOT NULL
           ORDER BY u.id DESC
           LIMIT ? OFFSET ?`,
      withTranslation ? [withTranslation.lang, userId, limit, offset] : [userId, limit, offset],
    );
    return rows as UnlockHistoryRow[];
  }

  /** 公告译文缓存 upsert（后台补翻落库） */
  async upsertNoticeTranslation(noticeId: number, lang: string, titleTr: string, descriptionTr: string, model: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO notice_translations (notice_id, lang, title_tr, description_tr, model)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), description_tr = VALUES(description_tr), model = VALUES(model)`,
      [noticeId, lang, titleTr, descriptionTr, model],
    );
  }
}
