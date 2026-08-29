/**
 * 机构缓存管理
 * Agency Cache Management
 *
 * @module server/services/notice-search/agencies/cache
 */
import type { Pool } from "mysql2/promise";
import type { AgencyCacheItem } from "../types";
import { INTL_TYPE_EN, COUNTRY_ZH } from "../../agency-i18n-data";

let noticeAgenciesCache: { data: AgencyCacheItem[]; timestamp: number } | null = null;
const AGENCIES_CACHE_TTL = 10 * 60 * 1000; // 10 分钟

// Promise 去重——并发请求共享同一个刷新 Promise
let _pendingAgenciesRefresh: Promise<AgencyCacheItem[]> | null = null;

// ── 英文回退名构建 ──
// INTL_TYPE_EN 的值为复数形式（"Committees"），typeKey 用单数（"COMMITTEE_INTL"）。
// 构建 单数形式 → typeKey 的反向映射，用于从国家级 typeKey（如 "Brazil Committees"）解析英文标签。
const _singularToIntlKey: Record<string, string> = {};
{
  const irregulars: Record<string, string> = {
    "Committees": "Committee", "Councils": "Council", "Commissions": "Commission",
    "Boards": "Board", "Tribunals": "Tribunal", "Universities": "University",
    "Colleges": "College", "Hospitals": "Hospital", "Foundations": "Foundation",
    "Funds": "Fund", "Associations": "Association", "Federations": "Federation",
    "Unions": "Union", "Societies": "Society", "Cooperatives": "Cooperative",
    "Trusts": "Trust", "Corporations": "Corporation", "Companies": "Company",
    "Banks": "Bank", "Institutes": "Institute", "Institutions": "Institution",
    "Centers": "Center", "Centres": "Centre", "Bureaus": "Bureau", "Agencies": "Agency",
    "Offices": "Office", "Divisions": "Division", "Courts": "Court",
    "Parliaments": "Parliament", "Congresses": "Congress", "Embassies": "Embassy",
    "Consulates": "Consulate", "Programmes": "Programme", "Programs": "Program",
    "Networks": "Network", "NGOs": "NGO", "Police": "Police",
    "Inspectorates": "Inspectorate", "Authorities": "Authority",
    "Electoral Bodies": "Electoral Body", "Water Authorities": "Water Authority",
    "Energy Authorities": "Energy Authority", "Roads Authorities": "Roads Authority",
    "Departments": "Department", "Ministries": "Ministry",
    "City Councils": "City Council", "Provincial Governments": "Provincial Government",
  };
  for (const [typeKey, enLabel] of Object.entries(INTL_TYPE_EN)) {
    const singular = irregulars[enLabel] || enLabel.replace(/s$/, "");
    _singularToIntlKey[singular.toLowerCase()] = typeKey;
  }
}

/** 从缓存条目构建英文回退显示名 */
function buildEnglishFallback(item: AgencyCacheItem): string {
  const agency = item.agency;
  // FORCE_COUNTRY / ORPHAN：从 key 中提取国家英文名
  const bucketMatch = agency.match(/^(?:FORCE_COUNTRY_|ORPHAN_)(.+)$/);
  if (bucketMatch) return `All ${bucketMatch[1]} Agencies`;
  // 含 _INTL 后缀的通用类型：直接转可读英文
  if (agency.endsWith("_INTL")) {
    const enLabel = INTL_TYPE_EN[agency];
    return enLabel || agency.replace(/_INTL$/, "").replace(/_/g, " ");
  }
  // 国家级国际类型（如 "Brazil Committees"）：拆出国家 + 类型
  for (const [countryEn, countryZh] of Object.entries(COUNTRY_ZH)) {
    if (agency.startsWith(countryEn + " ")) {
      const typePart = agency.slice(countryEn.length + 1);
      const typeKey = _singularToIntlKey[typePart.toLowerCase()];
      const enLabel = typeKey ? INTL_TYPE_EN[typeKey] : typePart;
      return `${countryEn} ${enLabel}`;
    }
  }
  // _BR / _KE 后缀的类型聚合：从 INTL_TYPE_EN 或 agency 字段推导
  const suffixMatch = agency.match(/^(.+?)_(BR|KE)$/);
  if (suffixMatch) {
    const base = suffixMatch[1].replace(/_/g, " ");
    const country = suffixMatch[2] === "BR" ? "Brazil" : "Kenya";
    return `${country} ${base}`;
  }
  // 独立机构：保留原名
  return agency;
}

/** 读取机构缓存，按 locale 解析翻译名 */
export async function getNoticeAgencies(
  pool: Pool,
  locale?: string,
  refreshFn?: (pool: Pool) => Promise<AgencyCacheItem[]>,
): Promise<Array<{ agency: string; count: number; agency_i18n?: string }>> {
  const cacheValid = noticeAgenciesCache && Date.now() - noticeAgenciesCache.timestamp < AGENCIES_CACHE_TTL;
  let items: AgencyCacheItem[];
  if (cacheValid) {
    items = noticeAgenciesCache!.data;
  } else {
    if (!_pendingAgenciesRefresh) {
      if (!refreshFn) throw new Error("refreshFn required when cache expired");
      _pendingAgenciesRefresh = refreshFn(pool).finally(() => {
        _pendingAgenciesRefresh = null;
      });
    }
    items = await _pendingAgenciesRefresh;
  }
  const lang = locale?.toLowerCase();
  if (!lang || lang === "en") {
    // 英文：用 i18n.en（如有）或从 typeKey 构建可读英文
    return items.map((item) => {
      const enName = item.i18n?.en || buildEnglishFallback(item);
      return enName !== item.agency ? { agency: item.agency, count: item.count, agency_i18n: enName } : { agency: item.agency, count: item.count };
    });
  }
  return items.map((item) => {
    const translated = item.i18n?.[lang];
    if (translated && translated !== item.agency) {
      return { agency: item.agency, count: item.count, agency_i18n: translated };
    }
    // 目标语言无翻译：回退英文
    const enFallback = item.i18n?.en || buildEnglishFallback(item);
    return enFallback !== item.agency ? { agency: item.agency, count: item.count, agency_i18n: enFallback } : { agency: item.agency, count: item.count };
  });
}

/** 获取机构缓存原始数据 */
export function getAgencyCacheData(): AgencyCacheItem[] | null {
  return noticeAgenciesCache?.data ?? null;
}

/** 设置机构缓存 */
export function setAgencyCacheData(data: AgencyCacheItem[]): void {
  noticeAgenciesCache = { data, timestamp: Date.now() };
}

/** 清除机构缓存 */
export function clearAgenciesCache(): void {
  noticeAgenciesCache = null;
  _pendingAgenciesRefresh = null;
}
