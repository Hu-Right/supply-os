/**
 * 统一搜索编排器 — 详情获取层（MySQL 唯一职责：按 ID 取完整字段）
 * Unified search orchestrator — detail fetch layer
 *
 * @module server/services/search-orchestrator/detail-fetch
 * @description Meilisearch 只返回 ID，本模块按 ID 列表从 MySQL 取完整字段。
 *              宽表优先（零 JOIN），宽表未就绪回退多表 JOIN。保持 FIELD() 顺序与传入一致。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { isWideTableReady } from "../search-sync/index";

const SUPPORTED_LANGS = ["zh", "en", "fr", "ru", "es", "ar"];

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
    const i18nTitleExpr = `title_${lang}`;
    const i18nDescExpr = `description_${lang}`;
    const [rows] = await pool.query(
      `SELECT id, notice_id, reference, title, notice_type_std AS notice_type,
         country_std AS country, agency_std AS agency, agency_group,
         NULLIF(deadline_sec, 0) AS deadline_sec, NULLIF(deadline_sec, 0) AS deadline_ts,
         estimated_value, is_featured,
         LEFT(description, 300) AS description,
         ${i18nTitleExpr} AS title_i18n, LEFT(${i18nDescExpr}, 500) AS description_i18n,
         title_en, LEFT(description_en, 500) AS description_en,
         description_cn, bid_overview, beneficiary_countries,
         documents_count AS breakdown_file_count,
         precise_level1, precise_level2, precise_level3, precise_level4, precise_level5
       FROM crm_notice_search
       WHERE id IN (${ids.map(() => "?").join(",")})
       ORDER BY FIELD(id, ${ids.map(() => "?").join(",")})`,
      [...ids, ...ids],
    );
    return rows as RowDataPacket[];
  }

  // 回退路径：原始多表 JOIN（宽表未就绪）
  const [rows] = await pool.query(
    `SELECT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country,
       n.deadline, n.deadline_ts, n.deadline_sec, n.estimated_value, n.agency,
       n.is_featured, n.documents, n.procurement_files,
       LEFT(n.description, 300) AS description,
       tr.title_tr AS title_i18n, tr.description_tr AS description_i18n,
       tre.title_tr AS title_en, tre.description_tr AS description_en,
       opp.description_cn,
       LEFT(opp.bid_overview, 200) AS bid_overview,
       opp.beneficiary_countries
     FROM crm_bid_notices n
     LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?
     LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'
     LEFT JOIN crm_bid_opportunities opp ON opp.source_notice_id = n.notice_id
       AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1)
     WHERE n.id IN (${ids.map(() => "?").join(",")})
     ORDER BY FIELD(n.id, ${ids.map(() => "?").join(",")})`,
    [locale || null, ...ids, ...ids],
  );
  return rows as RowDataPacket[];
}
