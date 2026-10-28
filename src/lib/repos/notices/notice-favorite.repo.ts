/**
 * 公告收藏数据访问层
 * Notice Favorite Repository
 *
 * @module server/repos/notices/notice-favorite.repo
 * @description 操作 notice_favorites 表：收藏为用户私有书签，
 *              与 notice_interests（意向/订阅，销售线索）动作语义分离。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export class NoticeFavoriteRepo {
  constructor(private pool: Pool) {}

  /** 是否已收藏 */
  async exists(userId: number, noticeId: number): Promise<boolean> {
    const [rows] = await this.pool.query(
      "SELECT 1 AS x FROM notice_favorites WHERE user_id = ? AND notice_id = ? LIMIT 1",
      [userId, noticeId],
    );
    return (rows as RowDataPacket[]).length > 0;
  }

  /** 公告是否存在（收藏前校验，防孤儿收藏行） */
  async noticeExists(noticeId: number): Promise<boolean> {
    const [rows] = await this.pool.query(
      "SELECT 1 AS x FROM bid_notices WHERE id = ? LIMIT 1",
      [noticeId],
    );
    return (rows as RowDataPacket[]).length > 0;
  }

  /** 收藏（INSERT IGNORE 幂等，重复收藏无副作用） */
  async insert(userId: number, noticeId: number): Promise<void> {
    await this.pool.execute(
      "INSERT IGNORE INTO notice_favorites (user_id, notice_id) VALUES (?, ?)",
      [userId, noticeId],
    );
  }

  /** 取消收藏 */
  async remove(userId: number, noticeId: number): Promise<void> {
    await this.pool.execute(
      "DELETE FROM notice_favorites WHERE user_id = ? AND notice_id = ?",
      [userId, noticeId],
    );
  }

  /** 用户已收藏的公告 id 集合（列表卡片/详情按钮状态回显） */
  async listNoticeIds(userId: number): Promise<number[]> {
    const [rows] = await this.pool.query(
      "SELECT notice_id FROM notice_favorites WHERE user_id = ? ORDER BY created_at DESC",
      [userId],
    );
    return (rows as RowDataPacket[]).map((r) => Number(r.notice_id));
  }

  /**
   * 我的收藏分页（按收藏时间倒序）——只出有序 notice_pk 列表 + 总数。
   * INNER JOIN 服务投影表 notice_public 自然过滤掉已下架/未发布收藏；
   * 字段水合统一交由 search-orchestrator 的 fetchDetailsByIds + formatItems（与主列表同一条尾）。
   */
  async listFavorites(
    userId: number,
    limit: number,
    offset: number,
  ): Promise<{ total: number; ids: number[] }> {
    const base = `FROM notice_favorites f
       JOIN notice_public p ON p.notice_pk = f.notice_id
       WHERE f.user_id = ?`;
    const [countRows] = await this.pool.query(
      `SELECT COUNT(*) AS total ${base}`,
      [userId],
    );
    const [rows] = await this.pool.query(
      `SELECT f.notice_id AS notice_pk ${base}
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset],
    );
    const total = Number((countRows as RowDataPacket[])[0]?.total || 0);
    const ids = (rows as RowDataPacket[]).map((r) => Number(r.notice_pk)).filter(Boolean);
    return { total, ids };
  }
}
