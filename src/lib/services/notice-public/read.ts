/**
 * 服务表详情读取：直接返回 notice_public 原字段，不做别名映射。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export async function findPublicDetail(pool: Pool, noticePk: number): Promise<RowDataPacket | null> {
  const [rows] = await pool.query(
    `SELECT p.notice_pk, p.notice_id, p.source_url, p.reference, p.title, p.title_cn, p.description, p.description_cn,
            p.content_level, p.industry, p.published_ts, p.deadline_ts, p.deadline_state,
            p.deadline_type, p.deadline_timezone,
            p.country_code, p.country_codes, p.notice_type_code, p.platform_name,
            p.buyer_name, p.buyer_name_cn, p.buyer_group, p.estimated_value, p.currency_code, p.currency_source,
            p.contacts, p.attachments, p.external_links, p.difficulty, p.registration_level,
            p.beneficiary_countries, p.updated_at, p.is_opportunity, d.timezone_source
       FROM notice_public p
       LEFT JOIN notice_deadline d ON d.notice_pk = p.notice_pk
      WHERE p.notice_pk = ? LIMIT 1`,
    [noticePk],
  );
  return (rows as RowDataPacket[])[0] ?? null;
}




