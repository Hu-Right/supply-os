/**
 * 国家下拉数据源（服务表口径，读侧零归一化）
 * Country dropdown data source — service-table based
 *
 * @module server/services/notice-search/countries
 * @description 2026-11-18 改读服务表 `notice_public.country_code`：
 *              构建服务表时已用 `country_aliases` 把主表原始 country 归一成 ISO2 码，
 *              读侧直接 GROUP BY 即可，无需再做 resolve；计数走迁移 046 的
 *              `idx_np_country_deadline(country_code, deadline_ts)` 索引扫描（实测 ~300ms）。
 *
 *              口径（与数字墙「数据源/API」一致）：**主国家 ISO2**，当前 189；
 *              多国家公告只计主国家（旧实现按多国家展开是 195，数字会略少，属预期）。
 *
 *              展示契约保持不变：[{ country, count }]，country 仍是 **canonical 英文标准名**。
 *              服务表存的是码，故用别名快照的 `byCode` 映射回 canonical——这一步不能省：
 *              `Intl.DisplayNames` 对部分码给的英文名与 canonical 并不一致（如
 *              Vietnam/Viet Nam、Russia/Russian Federation、Türkiye/Turkey 等），
 *              地图 GeoJSON 名称匹配与中文名映射都会因此失配（灰块 / 显示英文 / tooltip 0）。
 *
 *              缓存：进程内缓存无 TTL（启动预热 + 每日 05:00 + 别名变更主动失效），
 *              与旧口径一致；接口层再缓 10 分钟。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { loadCountryAliasSnapshot } from "../country/alias-store";
import type { CountryAliasSnapshot } from "../country/alias-store";
import { resolveCountries } from "../country/resolve";

let noticeCountriesCache: { data: Array<{ country: string; count: number }> } | null = null;
/** 最近一次刷新装载的表快照，供热路径同口径复用（TTL 内不重复查库）。 */
let _snap: CountryAliasSnapshot | null = null;

/**
 * 国家写法/标准名 → 该标准名在表内的全部归一键（大写、去重音），供 `n.country IN (...)`
 * 之类的形态并集匹配。无快照/未收录时退化为原值大写（不兜底旧静态）。
 */
export function expandCountryAliases(country: string, snapshot: CountryAliasSnapshot): string[] {
  const raw = String(country ?? "").trim();
  const code = raw.toUpperCase();
  // 输入可能是 ISO2 码（服务表/前端新口径）或国家写法（别名/子国家串）：
  // 先按码查 byCode，再走 resolveCountries 归一，最后回退原文
  const canonical =
    (/^[A-Z]{2}$/.test(code) ? snapshot.byCode?.get(code)?.canonical : undefined) ??
    resolveCountries(raw, snapshot).refs.find((r) => r.kind === "country")?.canonical ??
    raw;
  const forms = snapshot.formsByCanonical.get(canonical);
  return forms && forms.length ? forms : [raw.toUpperCase()];
}

/** 与 expandCountryAliases 同形态（归一键即大写去重音），保留以兼容调用点名。 */
export function expandCountryAllForms(country: string, snapshot: CountryAliasSnapshot): string[] {
  return expandCountryAliases(country, snapshot);
}

/** 当前装载的国家表快照（未装载为 null）。 */
export function getCountrySnapshot(): CountryAliasSnapshot | null {
  return _snap;
}

/** 从服务表重新查询并刷新国家缓存（主国家 ISO2 → canonical 展示名） */
export async function refreshNoticeCountries(pool: Pool): Promise<Array<{ country: string; count: number }>> {
  _snap = await loadCountryAliasSnapshot(pool);
  const snap = _snap;
  const [rows] = await pool.query(
    `SELECT p.country_code AS code, COUNT(*) AS cnt
       FROM notice_public p
      WHERE (p.deadline_ts IS NULL OR p.deadline_ts = 0 OR p.deadline_ts >= UNIX_TIMESTAMP(NOW()))
        AND p.country_code IS NOT NULL AND p.country_code <> ''
      GROUP BY p.country_code
      ORDER BY cnt DESC`
  );
  const merged = new Map<string, number>();
  for (const row of rows as RowDataPacket[]) {
    const code = String(row.code ?? "").trim().toUpperCase();
    if (!code) continue;
    // 服务表存 ISO2：先映射回 canonical 英文名（地图/下拉/中文名映射都按 canonical 走）；
    // 脏码/未收录码回退码本身（前端 getCountryDisplayName 会按 ISO2 兜底展示）
    const canonical = snap.byCode?.get(code)?.canonical ?? code;
    merged.set(canonical, (merged.get(canonical) ?? 0) + Number(row.cnt || 0));
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
