/**
 * 国家下拉数据源（一切以 crm_country_aliases 为准）
 * Country dropdown data source — table-driven
 *
 * @module server/services/notice-search/countries
 * @description 国家下拉的查询与缓存：每日凌晨 5 点定时刷新，启动预热。归一与合并全部走
 *              country/resolve（纯表驱动）：同一国家的各写法/子国家/多国串经 resolveCountries
 *              拆并到标准名，按 kind=country 聚合计数；region/invalid 天然被排除（不在表内 country）。
 *              别名展开（canonical → 全部归一键大写形态）同样由表快照 formsByCanonical 提供。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { loadCountryAliasSnapshot } from "../country/alias-store";
import type { CountryAliasSnapshot } from "../country/alias-store";
import { resolveCountries, countryCanonicalsOf } from "../country/resolve";
import { ACTIVE_NOTICE_WHERE } from "../../utils/notice-expired";

let noticeCountriesCache: { data: Array<{ country: string; count: number }> } | null = null;
/** 最近一次刷新装载的表快照，供热路径同口径复用（TTL 内不重复查库）。 */
let _snap: CountryAliasSnapshot | null = null;

/**
 * 国家写法/标准名 → 该标准名在表内的全部归一键（大写、去重音），供 `n.country IN (...)`
 * 之类的形态并集匹配。无快照/未收录时退化为原值大写（不兜底旧静态）。
 */
export function expandCountryAliases(country: string, snapshot: CountryAliasSnapshot): string[] {
  const canonical = resolveCountries(country, snapshot).refs.find((r) => r.kind === "country")?.canonical ?? country;
  const forms = snapshot.formsByCanonical.get(canonical);
  return forms && forms.length ? forms : [country.trim().toUpperCase()];
}

/** 与 expandCountryAliases 同形态（归一键即大写去重音），保留以兼容调用点名。 */
export function expandCountryAllForms(country: string, snapshot: CountryAliasSnapshot): string[] {
  return expandCountryAliases(country, snapshot);
}

/** 当前装载的国家表快照（未装载为 null）。 */
export function getCountrySnapshot(): CountryAliasSnapshot | null {
  return _snap;
}

/** 从数据库重新查询并刷新国家缓存（纯表驱动归一 + 按 kind=country 聚合） */
export async function refreshNoticeCountries(pool: Pool): Promise<Array<{ country: string; count: number }>> {
  _snap = await loadCountryAliasSnapshot(pool);
  const snap = _snap;
  const [rows] = await pool.query(
    `SELECT n.country, COUNT(*) AS cnt FROM crm_bid_notices n
     WHERE ${ACTIVE_NOTICE_WHERE}
       AND n.country IS NOT NULL AND n.country <> ''
     GROUP BY n.country ORDER BY cnt DESC`
  );
  const merged = new Map<string, number>();
  for (const row of rows as RowDataPacket[]) {
    for (const canonical of countryCanonicalsOf(resolveCountries(String(row.country || ""), snap))) {
      merged.set(canonical, (merged.get(canonical) || 0) + Number(row.cnt));
    }
  }
  const data = Array.from(merged.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count);
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
