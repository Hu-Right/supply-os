/**
 * 公告详情数据访问层
 * Notice Detail Repository
 *
 * @module server/repos/notices/notice-detail.repo
 * @description 操作 crm_bid_notices 表：详情/预览/翻译源字段/UNSPSC 快照。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { PLATFORM_PUBLISHED_ONLY_NO_ALIAS } from "@/lib/utils/notice-expired";
import { WIDE_LIMITS } from "@/lib/utils/notice-field-limits";
import { qualifiedOppWhere } from "@/lib/utils/notice-qualified";

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

  /**
   * 公告详情全字段（仅公开可见数据）
   *
   * 与 findDetail 字段一致，但排除未发布的平台用户 RFQ
   * （draft / pending_review），供面向用户的详情端点使用，
   * 防止通过直接猜测 ID 查看未过审内容。内部翻译管道用 findDetail。
   */
  async findDetailPublished(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      `SELECT id, notice_id, reference, title, notice_type, agency, organization, country,
       deadline, deadline_ts, estimated_value, description, industry, url, contacts,
       documents, procurement_files, external_links, agency_full, published_date,
       difficulty, registration_level, key_contacts, unspsc_codes, converted_opp_id, is_converted
     FROM crm_bid_notices WHERE id = ? AND ${PLATFORM_PUBLISHED_ONLY_NO_ALIAS} LIMIT 1`,
      [noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 公告锁定态预览字段（仅公开可见数据） */
  async findPreview(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      `SELECT id, notice_id, reference, title, agency, organization, agency_full, published_date,
         difficulty, registration_level, contacts, key_contacts, description,
         unspsc_codes, converted_opp_id
       FROM crm_bid_notices WHERE id = ? AND ${PLATFORM_PUBLISHED_ONLY_NO_ALIAS} LIMIT 1`,
      [noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /**
   * SEO 详情页公开字段（/procurement/notice/[id] SSR 用）。
   * 字段集 = findPreview 口径 + deadline/estimated_value/country/notice_type，
   * 描述与搜索列表同口径截断 WIDE_LIMITS.lockedTeaser —— 全文/联系人/文档仍是解锁后内容，
   * 严禁在此查询中放宽（会被 SSR 进 HTML 泄露给未付费用户与爬虫）。
   *
   * 描述来源与宽表构建的 DESC_SOURCE_EXPR 同语义（机会表优先、主表兜底），
   * 但不 JOIN 机会表而是用相关子查询取一行：改成 JOIN 会改变查询形状与性能特征。
   * 合格机会谓词与长度常量均为共享出口（I2），两者不会各写一份。
   */
  async findSeoDetail(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      `SELECT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.agency, n.agency_full,
         n.country, n.deadline, n.deadline_ts, n.deadline_sec, n.estimated_value,
         n.published_date,
         LEFT(COALESCE(
           (SELECT opp.description FROM crm_bid_opportunities opp
            WHERE opp.source_notice_id = n.notice_id
              AND ${qualifiedOppWhere("opp")}
            LIMIT 1),
           n.description
         ), ${WIDE_LIMITS.lockedTeaser}) AS description,
         CASE WHEN LENGTH(COALESCE(
           (SELECT opp.description FROM crm_bid_opportunities opp
            WHERE opp.source_notice_id = n.notice_id
              AND ${qualifiedOppWhere("opp")}
            LIMIT 1),
           n.description
         )) > ${WIDE_LIMITS.lockedTeaser} THEN 1 ELSE 0 END AS description_truncated
       FROM crm_bid_notices n WHERE n.id = ? AND ${PLATFORM_PUBLISHED_ONLY_NO_ALIAS} LIMIT 1`,
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
