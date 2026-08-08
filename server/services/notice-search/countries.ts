/**
 * 国家下拉数据源
 * Country dropdown data source
 *
 * @module server/services/notice-search/countries
 * @description 国家下拉列表的查询与缓存。每日凌晨 5 点定时刷新，启动时预热。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

let noticeCountriesCache: { data: Array<{ country: string; count: number }> } | null = null;

/** 从数据库重新查询并刷新国家缓存 */
export async function refreshNoticeCountries(pool: Pool): Promise<Array<{ country: string; count: number }>> {
  const [rows] = await pool.query(
    `SELECT n.country, COUNT(*) AS cnt FROM crm_bid_notices n
     WHERE n.is_active = 1 AND n.country IS NOT NULL AND n.country <> ''
     GROUP BY n.country ORDER BY cnt DESC`
  );
  const data = (rows as RowDataPacket[]).map((row) => ({ country: row.country, count: Number(row.cnt) }));
  noticeCountriesCache = { data };
  return data;
}

/** 读取国家缓存（启动预热后始终有数据，未预热时惰性加载兜底） */
export async function getNoticeCountries(pool: Pool): Promise<Array<{ country: string; count: number }>> {
  if (noticeCountriesCache) return noticeCountriesCache.data;
  return refreshNoticeCountries(pool);
}

/** 清除国家缓存（测试辅助） */
export function clearCountriesCache(): void {
  noticeCountriesCache = null;
}
