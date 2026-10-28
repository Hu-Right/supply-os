/**
 * 统一搜索编排器 — 详情获取层（MySQL 唯一职责：按 ID 取完整字段）
 * Unified search orchestrator — detail fetch layer
 *
 * @module server/services/search-orchestrator/detail-fetch
 * @description Meilisearch 只返回 ID，本模块按 ID 列表从 MySQL 取完整字段。
 *              宽表优先（零 JOIN），宽表未就绪回退多表 JOIN。保持 FIELD() 顺序与传入一致。
 *              两条路径的摘要长度与描述来源均引用 utils 层常量，与宽表构建同一口径（I2）：
 *              降级路径历史上自带第三份 COALESCE 副本，曾与宽表路径展示不同描述。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
// A2 解环：直接从无依赖叶子模块导入，不经过 search-sync barrel（避免循环回环）
import { isWideTableReady } from "../search-common/wide-table-readiness";
import { WIDE_LIMITS, DESC_SOURCE_EXPR } from "../../utils/notice-field-limits";
import { qualifiedOppWhere } from "../../utils/notice-qualified";
import { SUPPORTED_LANGS } from "../../utils/languages";

/**
 * 按 ID 列表获取公告详情行。
 * @param ids 公告 ID 列表（Meilisearch 返回，已按排序）
 * @param locale 界面语言（决定 title_i18n/description_i18n 取哪国译文）
 * @returns 详情行数组，顺序与传入 ids 一致（缺失的行被跳过）
 */
export async function fetchDetailsByIds(
  pool: Pool,
  ids: number[],
  locale: string,
): Promise<RowDataPacket[]> {
  if (ids.length === 0) return [];
  const lang = locale && SUPPORTED_LANGS.includes(locale) ? locale : "en";
  const useWideTable = await isWideTableReady(pool);

  if (useWideTable) {
    const i18nTitleExpr = `s.title_${lang}`;
    const i18nDescExpr = `s.description_${lang}`;
    const [rows] = await pool.query(
      `SELECT p.notice_pk, p.notice_id, p.source_url, p.reference, p.title,
         LEFT(p.description, ${WIDE_LIMITS.lockedTeaser}) AS description,
         CASE WHEN LENGTH(p.description) > ${WIDE_LIMITS.lockedTeaser} THEN 1 ELSE 0 END AS description_truncated,
         p.description_cn, p.notice_type_code, p.country_code,
         p.buyer_name, p.buyer_group, p.deadline_ts, p.deadline_state, p.deadline_type, p.deadline_timezone,
         p.published_ts, d.timezone_source,
         p.estimated_value, p.currency_code, p.platform_name,
         p.attachments, p.contacts, p.is_opportunity, p.content_level,
         p.industry, p.registration_level, p.beneficiary_countries,
         p.updated_at,
         ${i18nTitleExpr} AS title_i18n, LEFT(${i18nDescExpr}, ${WIDE_LIMITS.i18nTeaser}) AS description_i18n,
         s.title_en, LEFT(s.description_en, ${WIDE_LIMITS.i18nTeaser}) AS description_en,
         s.backbone_path, s.entry_source
       FROM notice_public p
       LEFT JOIN notice_search s ON s.id = p.notice_pk
       LEFT JOIN notice_deadline d ON d.notice_pk = p.notice_pk
       WHERE p.notice_pk IN (${ids.map(() => "?").join(",")})
       ORDER BY FIELD(p.notice_pk, ${ids.map(() => "?").join(",")})`,
      [...ids, ...ids],
    );
    return rows as RowDataPacket[];
  }

  // 回退路径：原始多表 JOIN（宽表未就绪）
  const [rows] = await pool.query(
    `SELECT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
       n.deadline, n.deadline_ts, n.deadline_sec, n.estimated_value, n.agency,
       n.is_featured, n.documents, n.procurement_files,
       LEFT(${DESC_SOURCE_EXPR}, ${WIDE_LIMITS.lockedTeaser}) AS description,
       CASE WHEN LENGTH(${DESC_SOURCE_EXPR}) > ${WIDE_LIMITS.lockedTeaser} THEN 1 ELSE 0 END AS description_truncated,
       tr.title_tr AS title_i18n, tr.description_tr AS description_i18n,
       tre.title_tr AS title_en, tre.description_tr AS description_en,
       opp.description_cn,
       opp.beneficiary_countries
     FROM bid_notices n
     LEFT JOIN notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?
     LEFT JOIN notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'
     LEFT JOIN bid_opportunities opp ON opp.source_notice_id = n.notice_id
       AND ${qualifiedOppWhere("opp")}
     WHERE n.id IN (${ids.map(() => "?").join(",")})
     ORDER BY FIELD(n.id, ${ids.map(() => "?").join(",")})`,
    [locale || null, ...ids, ...ids],
  );
  return rows as RowDataPacket[];
}




