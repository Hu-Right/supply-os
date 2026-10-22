/**
 * 服务表详情读取：直接返回 crm_notice_public 原字段，不做别名映射。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export async function findPublicDetail(pool: Pool, noticePk: number): Promise<RowDataPacket | null> {
  const [rows] = await pool.query(
    `SELECT notice_pk, notice_id, source_url, reference, title, description, description_cn,
            content_level, industry, published_ts, deadline_ts, deadline_state,
            country_code, country_codes, notice_type_code, platform_name,
            buyer_name, buyer_group, estimated_value, currency_code, currency_source,
            contacts, attachments, external_links, difficulty, registration_level,
            beneficiary_countries, updated_at, is_opportunity
       FROM crm_notice_public WHERE notice_pk = ? LIMIT 1`,
    [noticePk],
  );
  return (rows as RowDataPacket[])[0] ?? null;
}
