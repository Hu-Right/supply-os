/**
 * 国家下拉数据源
 * Country dropdown data source
 *
 * @module server/services/notice-search/countries
 * @description 国家下拉列表的查询与缓存。每日凌晨 5 点定时刷新，启动时预热。
 *              国家名归一化：复用前端 COUNTRY_NAME_ZH 映射表（200+ 条覆盖）
 *              作为归一化依据，将数据库中同一国家的不同名称变体合并为标准名，
 *              避免下拉列表中出现重复国家（如 "Philippines" 和 "The Philippines"
 *              都显示为"菲律宾"）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { COUNTRY_NAME_ZH } from "../../../src/shared/data/countryNames";
import { normalizeCountry } from "../../utils/countryNormalize";
import { ACTIVE_NOTICE_WHERE } from "../../utils/notice-expired";

let noticeCountriesCache: { data: Array<{ country: string; count: number }> } | null = null;

// ── 构建归一化映射：利用 COUNTRY_NAME_ZH 自动生成 ──────────────────────────

/** 中文名 → 所有已知英文名变体（含原始大小写形式） */
const ZH_TO_EN_FORMS = new Map<string, string[]>();

/** 大写英文名 → 标准英文名（原始大小写） */
const UPPER_TO_CANONICAL = new Map<string, string>();

/** 标准英文名 → 所有已知大写形式（供 MySQL UPPER(n.country) IN (...) 使用） */
const CANONICAL_TO_UPPER_FORMS = new Map<string, string[]>();

/** 标准英文名 → 所有已知原始大小写形式（供 Meilisearch 精确匹配使用） */
const CANONICAL_TO_ORIGINAL_FORMS = new Map<string, string[]>();

{
  // Step 1: 按中文名分组，收集所有英文名变体
  const zhGroups = new Map<string, string[]>();
  for (const [en, zh] of Object.entries(COUNTRY_NAME_ZH)) {
    if (!zhGroups.has(zh)) zhGroups.set(zh, []);
    zhGroups.get(zh)!.push(en);
  }

  // Step 2: 为每组选择标准名（canonical）
  for (const [zh, forms] of zhGroups) {
    if (["东部和南部非洲", "西部和中部非洲", "西南印度洋", "多国", "区域"].includes(zh)) continue;

    ZH_TO_EN_FORMS.set(zh, [...forms]);
    const canonical = forms.find((f) => /[a-z]/.test(f)) || forms[0];

    for (const form of forms) {
      UPPER_TO_CANONICAL.set(form.toUpperCase(), canonical);
    }
    UPPER_TO_CANONICAL.set(canonical.toUpperCase(), canonical);
  }

  // Step 3: 建立 canonical → 形式列表
  for (const [zh, forms] of ZH_TO_EN_FORMS) {
    const canonical = UPPER_TO_CANONICAL.get(forms[0].toUpperCase());
    if (!canonical) continue;
    const upperForms = [...new Set(forms.map((f) => f.toUpperCase()))];
    CANONICAL_TO_UPPER_FORMS.set(canonical, upperForms);
    const originalForms = [...new Set([...forms, ...upperForms])];
    CANONICAL_TO_ORIGINAL_FORMS.set(canonical, originalForms);
  }
}

/**
 * 获取国家名的所有已知大写形式（供 MySQL 搜索 SQL 的 UPPER(n.country) IN (...) 使用）
 * 当用户选择 "South Korea" 时，先归一化到 "Korea, Republic of"，然后返回 ["KOREA, REPUBLIC OF", "REPUBLIC OF KOREA", "SOUTH KOREA", "R.O.K"]
 */
export function expandCountryAliases(country: string): string[] {
  const canonical = normalizeCountry(country);
  return CANONICAL_TO_UPPER_FORMS.get(canonical) || [country.toUpperCase()];
}

/**
 * 获取国家名的所有已知形式（原始大小写 + 大写，供 Meilisearch 精确匹配使用）
 * Meilisearch 过滤器大小写敏感，需同时包含原始形式和大写形式以覆盖索引中的各种存储
 */
export function expandCountryAllForms(country: string): string[] {
  const canonical = normalizeCountry(country);
  return CANONICAL_TO_ORIGINAL_FORMS.get(canonical) || [country, country.toUpperCase()];
}

/** 从数据库重新查询并刷新国家缓存（含归一化合并） */
export async function refreshNoticeCountries(pool: Pool): Promise<Array<{ country: string; count: number }>> {
  // 修复：与搜索路径口径统一，只用 deadline_sec 实时判断，移除 is_active 依赖
  const [rows] = await pool.query(
    `SELECT n.country, COUNT(*) AS cnt FROM crm_bid_notices n
     WHERE ${ACTIVE_NOTICE_WHERE}
       AND n.country IS NOT NULL AND n.country <> ''
     GROUP BY n.country ORDER BY cnt DESC`
  );
  // 归一化合并：将同一国家的不同名称变体的计数合并到标准名
  const merged = new Map<string, number>();
  for (const row of rows as RowDataPacket[]) {
    const canonical = normalizeCountry(String(row.country || ""));
    if (!canonical) continue;
    merged.set(canonical, (merged.get(canonical) || 0) + Number(row.cnt));
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
