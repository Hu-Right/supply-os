/**
 * 机构别名归一 · 共享单一事实源
 * Agency Alias Store (single source of truth)
 *
 * @module server/services/agency/alias-store
 * @description 全项目唯一读取 crm_agency_aliases 的入口：一份 10 分钟缓存、
 *              一份归一函数 normalizeAliasKey、一份降级策略（限频 warn + JSON 容错）。
 *              消费方：wide-row-builder.loadAliasMap（取 canonical）、
 *                      notice-search/agencies/query（取 canonical + i18n）。
 *              依赖图：仅依赖 mysql2 类型，不得被 agency-i18n-data 反向引用（防成环）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface AgencyAliasEntry { canonical: string; i18n: Record<string, string> | null }
export interface AgencyAliasSnapshot { byAlias: Map<string, AgencyAliasEntry> }

/** 归一键：trim + 大写（全项目唯一口径，与 uk_normalized_alias 目标形态对齐） */
export function normalizeAliasKey(s: unknown): string {
  return String(s ?? "").trim().toUpperCase();
}

const ALIAS_TTL = 10 * 60 * 1000; // 10 分钟
const WARN_THROTTLE = 5 * 60 * 1000; // 同类告警 5 分钟最多一条（增量同步每 5s 触发，防刷屏）

let _cache: AgencyAliasSnapshot | null = null;
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

/** 读取别名快照（命中缓存则零查库）。失败降级：有旧缓存用旧的，否则空快照，均限频告警。 */
export async function loadAgencyAliasSnapshot(pool: Pool): Promise<AgencyAliasSnapshot> {
  if (_cache && Date.now() < _expires) return _cache;

  const byAlias = new Map<string, AgencyAliasEntry>();
  try {
    const [rows] = await pool.query("SELECT canonical, alias, name_i18n FROM crm_agency_aliases");
    for (const row of rows as RowDataPacket[]) {
      const canonical = String(row.canonical || "").trim();
      if (!canonical) continue; // 空 canonical 无意义，跳过（避免把机构归到空名）
      let i18n: Record<string, string> | null = null;
      if (row.name_i18n) {
        try {
          i18n = typeof row.name_i18n === "string" ? JSON.parse(row.name_i18n) : row.name_i18n;
        } catch {
          throttledWarn("json", `[agency-alias] name_i18n JSON 解析失败（canonical=${canonical}），该条 i18n 置 null`);
        }
      }
      byAlias.set(normalizeAliasKey(row.alias), { canonical, i18n });
    }
    _cache = { byAlias };
    _expires = Date.now() + ALIAS_TTL;
    return _cache;
  } catch (err) {
    throttledWarn(
      "query",
      `[agency-alias] crm_agency_aliases 查询失败（降级：${_cache ? "沿用旧缓存" : "返回空快照"}，将在下次调用重试）: ${(err as Error).message}`,
    );
    if (_cache) return _cache;
    return { byAlias };
  }
}

/** 主动失效（供改表后编排调用；见 Plan 2 onAgencyAliasesChanged） */
export function invalidateAgencyAliasCache(): void {
  _cache = null;
  _expires = 0;
}

/** 仅测试用：清空模块缓存与告警节流态，保证用例隔离 */
export function __resetAgencyAliasStoreForTest(): void {
  _cache = null;
  _expires = 0;
  _lastQueryWarnAt = 0;
  _lastJsonWarnAt = 0;
}
