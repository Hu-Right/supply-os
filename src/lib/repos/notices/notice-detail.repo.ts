/**
 * 公告详情数据访问层
 * Notice Detail Repository
 *
 * @module server/repos/notices/notice-detail.repo
 * @description 操作 bid_notices 表：详情/预览/翻译源字段。
 *              旧品类码退役 R5'（2026-10-14）：主表那个 JSON 快照列运行期不再 SELECT；
 *              归属事实源已收敛到 notice_attribution_nodes，旧列属"错但稳定"历史快照，
 *              前端 4 处消费方已有 `|| []` 兜底 ⇒ 自动降级。列物理 DROP 属下一个批次（§9）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { PLATFORM_PUBLISHED_ONLY_NO_ALIAS } from "@/lib/utils/notice-expired";
import { WIDE_LIMITS } from "@/lib/utils/notice-field-limits";
import { formatNoticeUTCDate } from "@/shared/utils/notice-datetime/format";

export class NoticeDetailRepo {
  constructor(private pool: Pool) {}

  /** 按 id 查公告存在性（解锁/反馈入口先验存在；字段拉取交给 findDetail/findPreview）*/
  async findById(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id FROM bid_notices WHERE id = ? LIMIT 1",
      [noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 批量取公告 旧品类原始串（反馈联动兴趣码用） */
  /*
   * R3'-小表剥离（2026-10-14）删除：旧快照批量取数入口。
   * 删的依据是「方法与唯一调用方同批换源」：反馈链的兴趣画像改吃倒排表 UGT
   * 节点码（services/commodity/interest.ts loadNoticeNodeCodes），本方法零读者。
   * 主表那个快照列的物理退役属 D1' 物理批次，不随本批。
   */

  /**
   * 公告详情全字段
   *
   * 批次二（2026-10-15）从这两份 SELECT 清单里摘掉了镜像位 is_converted：
   * 本仓全域零消费（详情响应靠 `...notice` 整行铺开，所以「有 SELECT」不等于「有读者」，
   * 已逐文件核过 src/features 含 .tsx 无一处引用），且它可由 converted_opp_id 推导。
   * 列的物理退役走影子表蓝绿（scripts/tools/notices-shadow-phase1.mjs --batch=2）。
   */
  async findDetail(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      `SELECT id, notice_id, reference, title, notice_type, agency, organization, country,
       deadline, deadline_ts, estimated_value, description, industry, url, contacts,
       documents, procurement_files, external_links, agency_full, published_date,
       registration_level, key_contacts, converted_opp_id
     FROM bid_notices WHERE id = ? LIMIT 1`,
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
       registration_level, key_contacts, converted_opp_id
     FROM bid_notices WHERE id = ? AND ${PLATFORM_PUBLISHED_ONLY_NO_ALIAS} LIMIT 1`,
      [noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 公告锁定态预览字段（仅公开可见数据） */
  async findPreview(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      `SELECT id, notice_id, reference, title, agency, organization, agency_full, published_date,
         registration_level, contacts, key_contacts, description,
         converted_opp_id
       FROM bid_notices WHERE id = ? AND ${PLATFORM_PUBLISHED_ONLY_NO_ALIAS} LIMIT 1`,
      [noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /**
   * SEO 详情页公开字段（/procurement/notice/[id] SSR 用）——服务表口径，单表零 JOIN，无回退。
   *
   * [2026-11-18 收口] 详情页只读 notice_public（与列表卡片、/api/notices/:id/preview、
   * /detail 同源 SSOT）：主表归一前的原始列（country 文本、agency/agency_full 双列、
   * published_date 文本、deadline 原文）在服务表里都有等价归一列，页面侧直接推导，
   * 不再回查主表，避免同一公告在列表与 SEO 页出现两套国别/类型/机构名。
   *
   * 描述与搜索列表同口径截断 WIDE_LIMITS.lockedTeaser —— 全文/联系人/文档仍是解锁后内容，
   * 严禁在此查询中放宽（会被 SSR 进 HTML 泄露给未付费用户与爬虫）。
   *
   * effective_ts 直接取 deadline_ts：服务表的 deadline_ts 只在 deadline_state=known 时有值，
   * 语义与 notice_deadline.effective_ts 一致，故不必再 JOIN 语义层表。
   * 机构：buyer_name_cn 作主展示名（agency），buyer_name 作原名（agency_full）。
   */
  async findSeoDetailFromPublic(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      `SELECT p.notice_pk AS id, p.notice_id, p.reference, p.title, p.title_cn,
         p.notice_type_code AS notice_type,
         p.buyer_name_cn AS agency, p.buyer_name AS agency_full,
         p.country_code,
         p.deadline_ts, p.deadline_ts AS effective_ts,
         p.deadline_state, p.deadline_type, p.deadline_timezone, p.timezone_source,
         p.estimated_value,
         p.published_ts,
         LEFT(p.description, ${WIDE_LIMITS.lockedTeaser}) AS description,
         LEFT(p.description_cn, ${WIDE_LIMITS.lockedTeaser}) AS description_cn,
         CASE WHEN LENGTH(p.description) > ${WIDE_LIMITS.lockedTeaser} THEN 1 ELSE 0 END AS description_truncated
       FROM notice_public p
       WHERE p.notice_pk = ? LIMIT 1`,
      [noticeId],
    );
    const row = (rows as RowDataPacket[])[0] ?? null;
    // 发布时间按墙上时间（UTC）还原，与 formatNoticeTs / 主表 published_date 同口径；
    // 不在 SQL 里用 FROM_UNIXTIME 拼接，避免依赖连接会话时区。
    if (row) {
      row.published_date = row.published_ts ? formatNoticeUTCDate(Number(row.published_ts)) : null;
    }
    return row;
  }

  /**
   * 同国家相关公告（SEO 详情页内链）。
   *
   * @description 只读公开服务表，取该国未截止的最近公告；用于把 4 万条公告
   *              连成「同国别」关系网，避免详情页成为只进不出的孤儿页。
   *              截止时间未知（NULL/0）视为长期有效，排在有时限的公告之后。
   */
  async findRelatedByCountry(
    noticePk: number,
    countryCode: string,
    limit = 6,
  ): Promise<RowDataPacket[]> {
    const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 12);
    const [rows] = await this.pool.query(
      `SELECT p.notice_pk AS id, p.title, p.deadline_ts
       FROM notice_public p
       WHERE p.country_code = ?
         AND p.notice_pk <> ?
         AND (p.deadline_ts IS NULL OR p.deadline_ts = 0 OR p.deadline_ts >= UNIX_TIMESTAMP(NOW()))
       ORDER BY (p.deadline_ts IS NULL OR p.deadline_ts = 0) ASC, p.deadline_ts ASC
       LIMIT ${safeLimit}`,
      [countryCode, noticePk],
    );
    return rows as RowDataPacket[];
  }

  /**
   * 分享卡（OG 图）取数：只读 notice_public 的公开字段 + 摘要列。
   *
   * 与 SEO 页同一公开口径（不含联系人/附件/全文），正文只取前 4000 字符用于
   * 「摘要列为空时现场回退」；卡片不展示付费内容。
   */
  async findShareCardFromPublic(noticePk: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      `SELECT p.notice_pk AS id, p.notice_id, p.title, p.title_cn,
         p.buyer_name, p.buyer_name_cn, p.country_code,
         p.notice_type_code AS notice_type,
         p.deadline_ts, p.deadline_state, p.deadline_timezone, p.timezone_source,
         p.share_summary, p.share_summary_en,
         LEFT(p.description, 4000) AS description,
         LEFT(p.description_cn, 4000) AS description_cn
       FROM notice_public p
       WHERE p.notice_pk = ? LIMIT 1`,
      [noticePk],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /**
   * 翻译决策所需元信息（描述源与机会转换标记） */
  async findDescMeta(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      `SELECT n.description AS notice_desc, n.converted_opp_id, n.notice_id, n.reference
       FROM bid_notices n WHERE n.id = ? LIMIT 1`,
      [noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 翻译源字段（标题 + 描述 + 机会转换标记） */
  async findForTranslation(noticeId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id, notice_id, reference, title, description, converted_opp_id FROM bid_notices WHERE id = ? LIMIT 1",
      [noticeId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }
}
