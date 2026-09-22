/**
 * 公告收藏数据访问层
 * Notice Favorite Repository
 *
 * @module server/repos/notices/notice-favorite.repo
 * @description 操作 crm_notice_favorites 表：收藏为用户私有书签，
 *              与 crm_notice_interests（意向/订阅，销售线索）动作语义分离。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export class NoticeFavoriteRepo {
  constructor(private pool: Pool) {}

  /** 是否已收藏 */
  async exists(userId: number, noticeId: number): Promise<boolean> {
    const [rows] = await this.pool.query(
      "SELECT 1 AS x FROM crm_notice_favorites WHERE user_id = ? AND notice_id = ? LIMIT 1",
      [userId, noticeId],
    );
    return (rows as RowDataPacket[]).length > 0;
  }

  /** 公告是否存在（收藏前校验，防孤儿收藏行） */
  async noticeExists(noticeId: number): Promise<boolean> {
    const [rows] = await this.pool.query(
      "SELECT 1 AS x FROM crm_bid_notices WHERE id = ? LIMIT 1",
      [noticeId],
    );
    return (rows as RowDataPacket[]).length > 0;
  }

  /** 收藏（INSERT IGNORE 幂等，重复收藏无副作用） */
  async insert(userId: number, noticeId: number): Promise<void> {
    await this.pool.execute(
      "INSERT IGNORE INTO crm_notice_favorites (user_id, notice_id) VALUES (?, ?)",
      [userId, noticeId],
    );
  }

  /** 取消收藏 */
  async remove(userId: number, noticeId: number): Promise<void> {
    await this.pool.execute(
      "DELETE FROM crm_notice_favorites WHERE user_id = ? AND notice_id = ?",
      [userId, noticeId],
    );
  }

  /** 用户已收藏的公告 id 集合（列表卡片/详情按钮状态回显） */
  async listNoticeIds(userId: number): Promise<number[]> {
    const [rows] = await this.pool.query(
      "SELECT notice_id FROM crm_notice_favorites WHERE user_id = ? ORDER BY created_at DESC",
      [userId],
    );
    return (rows as RowDataPacket[]).map((r) => Number(r.notice_id));
  }

  /** 我的收藏分页（INNER JOIN 过滤已删除公告，按收藏时间倒序；lang 附标题译文） */
  async listFavorites(
    userId: number,
    limit: number,
    offset: number,
    lang: string | null,
  ): Promise<{ total: number; items: RowDataPacket[] }> {
    const [countRows] = await this.pool.query(
      `SELECT COUNT(*) AS total
       FROM crm_notice_favorites f
       JOIN crm_bid_notices n ON n.id = f.notice_id
       WHERE f.user_id = ?`,
      [userId],
    );
    const [rows] = await this.pool.query(
      lang
        ? `SELECT f.notice_id AS id, n.reference, n.title, n.country, n.notice_type,
                  n.agency, n.deadline, n.deadline_ts, n.estimated_value,
                  tr.title_tr AS title_i18n, f.created_at AS favorited_at
           FROM crm_notice_favorites f
           JOIN crm_bid_notices n ON n.id = f.notice_id
           LEFT JOIN crm_notice_translations tr ON tr.notice_id = f.notice_id AND tr.lang = ?
           WHERE f.user_id = ?
           ORDER BY f.created_at DESC
           LIMIT ? OFFSET ?`
        : `SELECT f.notice_id AS id, n.reference, n.title, n.country, n.notice_type,
                  n.agency, n.deadline, n.deadline_ts, n.estimated_value,
                  f.created_at AS favorited_at
           FROM crm_notice_favorites f
           JOIN crm_bid_notices n ON n.id = f.notice_id
           WHERE f.user_id = ?
           ORDER BY f.created_at DESC
           LIMIT ? OFFSET ?`,
      lang ? [lang, userId, limit, offset] : [userId, limit, offset],
    );
    const total = Number((countRows as RowDataPacket[])[0]?.total || 0);
    return { total, items: rows as RowDataPacket[] };
  }
}
