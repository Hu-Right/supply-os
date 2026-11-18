/**
 * 统一搜索编排器 — 详情获取层（MySQL 唯一职责：按 ID 取完整字段）
 * Unified search orchestrator — detail fetch layer
 *
 * @module server/services/search-orchestrator/detail-fetch
 * @description Meilisearch 只返回 ID，本模块按 ID 列表从服务表取完整字段。
 *
 *              [2026-11-18 收口] 只读服务表 notice_public（+ notice_search 补骨架列），
 *              主表 bid_notices 不参与、也不再为「服务表已清退的过期行」回退补齐：
 *              过期行已下架，直链/收藏按 404 处理（与详情页同口径）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { WIDE_LIMITS } from "../../utils/notice-field-limits";

/**
 * 按 ID 列表获取公告详情行（服务表单表 + 骨架列，零主表 JOIN）。
 * @param ids 公告 ID 列表（Meilisearch 返回，已按排序）
 * @param _locale 界面语言（历史参数；水合口径已统一为 title_cn/description，保留签名兼容调用方）
 * @returns 详情行数组，顺序与传入 ids 一致（缺失的行被跳过）
 */
export async function fetchDetailsByIds(
  pool: Pool,
  ids: number[],
  _locale: string,
): Promise<RowDataPacket[]> {
  if (ids.length === 0) return [];
  const [rows] = await pool.query(
    `SELECT p.notice_pk, p.notice_id, p.source_url, p.reference, p.title, p.title_cn,
       LEFT(p.description, ${WIDE_LIMITS.lockedTeaser}) AS description,
       CASE WHEN LENGTH(p.description) > ${WIDE_LIMITS.lockedTeaser} THEN 1 ELSE 0 END AS description_truncated,
       p.description_cn, p.notice_type_code, p.country_code,
       p.buyer_name, p.buyer_name_cn, p.deadline_ts, p.deadline_state, p.deadline_type, p.deadline_timezone,
       p.published_ts, p.timezone_source,
       p.estimated_value, p.currency_code, p.platform_name,
       p.attachments, p.contacts, p.is_opportunity, p.content_level,
       p.industry, p.registration_level, p.beneficiary_countries,
       p.supplier_conditions, p.eligibility, p.technical_hurdles,
       p.updated_at,
       s.backbone_path, s.entry_source
     FROM notice_public p
     LEFT JOIN notice_search s ON s.id = p.notice_pk
     WHERE p.notice_pk IN (${ids.map(() => "?").join(",")})
     ORDER BY FIELD(p.notice_pk, ${ids.map(() => "?").join(",")})`,
    [...ids, ...ids],
  );
  return rows as RowDataPacket[];
}

