/**
 * 国家别名归一 · 共享单一事实源
 * Country Alias Store (single source of truth)
 *
 * @module server/services/country/alias-store
 * @description 全项目唯一读取 country_aliases 的入口：一份 10 分钟缓存、
 *              一份归一键 normalizeCountryKey（去重音 + trim + 大写，与唯一索引
 *              uk_normalized_alias 在 utf8mb4_0900_ai_ci 下的判等口径对齐）、
 *              一份降级策略（限频 warn + JSON 容错）。
 *              消费方：notice-search/countries（下拉聚合 + 别名展开）、
 *                      notice-public/build 与 search-sync/wide-row-builder（country_name 归一/投影）。
 *              依赖图：仅依赖 mysql2 类型，与 agency/alias-store 平级、互不引用。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { cleanCountryRaw } from "./clean";

export type CountryKind = "country" | "region" | "invalid";
export interface CountryAliasEntry {
  canonical: string;
  code: string | null;
  kind: CountryKind;
  zh: string;
}
export interface CountryAliasSnapshot {
  /** 归一键(去重音大写) → 条目 */
  byKey: Map<string, CountryAliasEntry>;
  /** 标准名 canonical → 该 canonical 的所有归一键（供反向别名展开；含大写形式） */
  formsByCanonical: Map<string, string[]>;
}

/**
 * 归一键：cleanCountryRaw 清洗（剥脏前缀/HTML 实体/括号转逗号）→ 去重音 → 大写。
 * 必须与运行期查表口径一致，否则别名存进去的 raw（如 "Eswatini (Swaziland)"）
 * 与解析时先清洗后的键（"Eswatini, Swaziland"）对不上。
 */
export function normalizeCountryKey(s: unknown): string {
  return cleanCountryRaw(String(s ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

const SNAPSHOT_TTL = 10 * 60 * 1000; // 10 分钟
const WARN_THROTTLE = 5 * 60 * 1000; // 同类告警 5 分钟最多一条（同步 worker 高频触发，防刷屏）

let _cache: CountryAliasSnapshot | null = null;
let _expires = 0;
let _lastQueryWarnAt = 0;
let _lastJsonWarnAt = 0;

function throttledWarn(bucket: "query" | "json", msg: string): void {
  const now = Date.now();
  if (bucket === "query") {
    if (now - _lastQueryWarnAt >= WARN_THROTTLE) { _lastQueryWarnAt = now; console.warn(msg); }
  } else {
    if (now - _lastJsonWarnAt >= WARN_THROTTLE) { _lastJsonWarnAt = now; console.warn(msg); }
  }
}

/** 读取快照（命中缓存则零查库）。失败降级：有旧缓存用旧的，否则空快照，均限频告警。 */
export async function loadCountryAliasSnapshot(pool: Pool): Promise<CountryAliasSnapshot> {
  if (_cache && Date.now() < _expires) return _cache;

  const byKey = new Map<string, CountryAliasEntry>();
  const formsByCanonical = new Map<string, string[]>();
  try {
    const [rows] = await pool.query(
      "SELECT canonical, country_code, alias, kind, name_i18n FROM country_aliases WHERE is_active = 1"
    );
    for (const row of rows as RowDataPacket[]) {
      const canonical = String(row.canonical || "").trim();
      if (!canonical) continue; // 空 canonical 无意义，跳过
      const kind: CountryKind =
        row.kind === "region" || row.kind === "invalid" ? (row.kind as CountryKind) : "country";
      let zh = "";
      if (row.name_i18n) {
        try {
          const i18n = typeof row.name_i18n === "string" ? JSON.parse(row.name_i18n) : row.name_i18n;
          zh = String(i18n?.zh || "");
        } catch {
          throttledWarn("json", `[country-alias] name_i18n JSON 解析失败（canonical=${canonical}），该条 zh 置空`);
        }
      }
      const key = normalizeCountryKey(row.alias);
      if (!key) continue;
      byKey.set(key, { canonical, code: row.country_code ? String(row.country_code) : null, kind, zh });
      const forms = formsByCanonical.get(canonical) ?? [];
      forms.push(key);
      formsByCanonical.set(canonical, forms);
    }
    _cache = { byKey, formsByCanonical };
    _expires = Date.now() + SNAPSHOT_TTL;
    return _cache;
  } catch (err) {
    throttledWarn(
      "query",
      `[country-alias] country_aliases 查询失败（降级：${_cache ? "沿用旧缓存" : "返回空快照"}，将在下次调用重试）: ${(err as Error).message}`,
    );
    if (_cache) return _cache;
    return { byKey, formsByCanonical };
  }
}

export interface CountryNameMaps {
  /** 英文写法（canonical 及各别名变体）→ 中文名 */
  countries: Record<string, string>;
  /** 区域英文名 → 中文 */
  regions: Record<string, string>;
  /** 中文名 → 英文 canonical（反向辅助） */
  zhToEn: Record<string, string>;
}

/**
 * 从 country_aliases 构建国家名展示映射（取代静态字典 lib/data/countryNames）。
 * 仍在唯一读表入口模块内，不旁路。kind=region 入 regions；其余入 countries；
 * zhToEn 以 canonical 作英文回推（同名 zh 首个胜）。无 zh 的行跳过（不入图）。
 */
export async function buildCountryNameMaps(pool: Pool): Promise<CountryNameMaps> {
  const countries: Record<string, string> = {};
  const regions: Record<string, string> = {};
  const zhToEn: Record<string, string> = {};
  const [rows] = await pool.query(
    "SELECT canonical, alias, kind, JSON_UNQUOTE(JSON_EXTRACT(name_i18n,'$.zh')) zh FROM country_aliases WHERE is_active = 1",
  );
  for (const row of rows as RowDataPacket[]) {
    const zh = String(row.zh ?? "").trim();
    const alias = String(row.alias ?? "").trim();
    const canonical = String(row.canonical ?? "").trim();
    if (!zh || !alias) continue;
    if (row.kind === "region") {
      regions[alias] = zh;
    } else {
      countries[alias] = zh;
      if (canonical && !(zh in zhToEn)) zhToEn[zh] = canonical;
    }
  }
  return { countries, regions, zhToEn };
}

/** 主动失效（供改表后编排调用；见 onCountryAliasesChanged） */
export function invalidateCountryAliasCache(): void {
  _cache = null;
  _expires = 0;
}

/** 仅测试用：清空模块缓存与告警节流态，保证用例隔离 */
export function __resetCountryAliasStoreForTest(): void {
  _cache = null;
  _expires = 0;
  _lastQueryWarnAt = 0;
  _lastJsonWarnAt = 0;
}
