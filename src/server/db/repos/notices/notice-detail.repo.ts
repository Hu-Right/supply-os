/**
 * 公告详情数据访问层
 * Notice Detail Repository
 *
 * @module server/repos/notices/notice-detail.repo
 * @description 操作 crm_bid_notices 表：详情/预览/翻译源字段/UNSPSC 快照。
 */
import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";

export class NoticeDetailRepo {
  constructor(private pool: Pool) {}

  /** 按 id 查公告基础信息（解锁/兴趣时取 UNSPSC 快照） */
  async findById(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id, unspsc_codes FROM crm_bid_notices WHERE id = ? LIMIT 1",
      [noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 批量取公告 UNSPSC 原始串（反馈联动兴趣码用） */
  async findUnspscSnapshots(noticeIds: number[]): Promise<RowDataPacket[]> {
    const [rows] = await this.pool.query(
      `SELECT id, unspsc_codes FROM crm_bid_notices WHERE id IN (${noticeIds.map(() => "?").join(",")})`,
      noticeIds,
    );
    return rows as RowDataPacket[];
  }

  /** 公告详情全字段 */
  async findDetail(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      `SELECT id, notice_id, reference, title, notice_type, agency, organization, country,
       deadline, deadline_ts, estimated_value, description, industry, url, contacts,
       documents, procurement_files, external_links, agency_full, published_date,
       difficulty, registration_level, key_contacts, unspsc_codes, converted_opp_id, is_converted
     FROM crm_bid_notices WHERE id = ? LIMIT 1`,
      [noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 公告锁定态预览字段 */
  async findPreview(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      `SELECT id, notice_id, reference, title, agency, organization, agency_full, published_date,
         difficulty, registration_level, contacts, key_contacts, description,
         unspsc_codes, converted_opp_id
       FROM crm_bid_notices WHERE id = ? LIMIT 1`,
      [noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 翻译决策所需元信息（描述源与机会转换标记） */
  async findDescMeta(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      `SELECT n.description AS notice_desc, n.converted_opp_id, n.notice_id, n.reference
       FROM crm_bid_notices n WHERE n.id = ? LIMIT 1`,
      [noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 翻译源字段（标题 + 描述 + 机会转换标记） */
  async findForTranslation(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id, notice_id, reference, title, description, converted_opp_id FROM crm_bid_notices WHERE id = ? LIMIT 1",
      [noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }
}
