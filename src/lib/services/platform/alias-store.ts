/**
 * 来源/采购平台别名归一 · 共享单一事实源
 * Platform Alias Store (single source of truth)
 *
 * @module server/services/platform/alias-store
 * @description 全项目唯一读取 crm_platform_aliases 的入口：一份 10 分钟缓存、
 *              一份归一键 normalizePlatformKey（小写、去协议/www/路径、去非字母数字，
 *              折叠 "域名 / 下划线码 / Camel / 显示名 / 短码" 多种拼法）、
 *              一份 host 维表 byHost（注册域 → 条目，兼容子域后缀匹配），
 *              一份降级策略（限频 warn + JSON 容错）。
 *              依赖图：仅依赖 mysql2 类型，与 country/agency 的 alias-store 平级、互不引用。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export type PlatformKind = "platform" | "other" | "invalid";
export interface PlatformAliasEntry {
  canonical: string;
  code: string | null;
  kind: PlatformKind;
  zh: string;
  /** 注册域（registrable domain，小写）；纯码/显示名行为空串 */
  host: string;
}
export interface PlatformAliasSnapshot {
  /** 归一键（见 normalizePlatformKey）→ 条目 */
  byKey: Map<string, PlatformAliasEntry>;
  /** 注册域（小写点分，如 mtender.gov.md）→ 条目；供子域后缀匹配 */
  byHost: Map<string, PlatformAliasEntry>;
  /** canonical → 该 canonical 的所有归一键（反向别名展开） */
  formsByCanonical: Map<string, string[]>;
}

/**
 * 归一键：小写 → 去 scheme → 去 www. → 取 host 段（截断到第一个 '/'）→ 去所有非字母数字。
 * 目的：把同一平台的多种书写（`mercadopublico.cl` / `mercadopublico_cl` / `Mercado Público`）
 * 折叠到同一无空白键；表里每种观测形各存一行 alias，故键折叠后仍逐形命中同一 canonical。
 * 与唯一索引 uk_normalized_alias（UPPER(TRIM)）判等口径不必逐字相同：运行期查表以此键为准，
 * 生成列仅防"完全重复的原始 alias 行"。
 */
export function normalizePlatformKey(s: unknown): string {
  let t = String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // 先 NFD 去音符（ó→o），与 country 归一键同口径
  t = t.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // 去 scheme（http:// https:// 等）
  t = t.replace(/^www\./, "");                  // 去 www.
  t = t.split("/")[0];                          // 截断到 host 段（去路径）
  t = t.split("@").pop() || t;                  // 去 userinfo（user@host → host）
  t = t.split(":")[0];                          // 去端口
  return t.replace(/[^a-z0-9]/g, "");           // 折叠：去所有非字母数字
}

/** 从 raw 提取 host（保留点分，供 byHost 后缀匹配）；非 host 形态返回空串 */
export function hostOf(raw: unknown): string {
  let t = String(raw ?? "").trim().toLowerCase();
  if (!t) return "";
  t = t.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^www\./, "");
  t = t.split("/")[0];
  t = t.split("@").pop() || t;
  t = t.split(":")[0];
  return t.includes(".") ? t : ""; // 无点视为码/名称，不走 host 维
}

const SNAPSHOT_TTL = 10 * 60 * 1000;
const WARN_THROTTLE = 5 * 60 * 1000;

let _cache: PlatformAliasSnapshot | null = null;
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
export async function loadPlatformAliasSnapshot(pool: Pool): Promise<PlatformAliasSnapshot> {
  if (_cache && Date.now() < _expires) return _cache;

  const byKey = new Map<string, PlatformAliasEntry>();
  const byHost = new Map<string, PlatformAliasEntry>();
  const formsByCanonical = new Map<string, string[]>();
  try {
    const [rows] = await pool.query(
      "SELECT canonical, platform_code, alias, host, kind, name_i18n FROM crm_platform_aliases WHERE is_active = 1"
    );
    for (const row of rows as RowDataPacket[]) {
      const canonical = String(row.canonical || "").trim();
      if (!canonical) continue;
      const kind: PlatformKind =
        row.kind === "other" || row.kind === "invalid" ? (row.kind as PlatformKind) : "platform";
      let zh = "";
      if (row.name_i18n) {
        try {
          const i18n = typeof row.name_i18n === "string" ? JSON.parse(row.name_i18n) : row.name_i18n;
          zh = String(i18n?.zh || "");
        } catch {
          throttledWarn("json", `[platform-alias] name_i18n JSON 解析失败（canonical=${canonical}），该条 zh 置空`);
        }
      }
      const host = String(row.host || "").trim().toLowerCase();
      const entry: PlatformAliasEntry = {
        canonical,
        code: row.platform_code ? String(row.platform_code) : null,
        kind,
        zh,
        host,
      };
      const key = normalizePlatformKey(row.alias);
      if (key) {
        byKey.set(key, entry);
        const forms = formsByCanonical.get(canonical) ?? [];
        forms.push(key);
        formsByCanonical.set(canonical, forms);
      }
      if (host && !byHost.has(host)) byHost.set(host, entry);
    }
    _cache = { byKey, byHost, formsByCanonical };
    _expires = Date.now() + SNAPSHOT_TTL;
    return _cache;
  } catch (err) {
    throttledWarn(
      "query",
      `[platform-alias] crm_platform_aliases 查询失败（降级：${_cache ? "沿用旧缓存" : "返回空快照"}，将在下次调用重试）: ${(err as Error).message}`,
    );
    if (_cache) return _cache;
    return { byKey, byHost, formsByCanonical };
  }
}

/** 主动失效（供改表后编排调用；见 onPlatformAliasesChanged） */
export function invalidatePlatformAliasCache(): void {
  _cache = null;
  _expires = 0;
}

/** 仅测试用：清空模块缓存与告警节流态，保证用例隔离 */
export function __resetPlatformAliasStoreForTest(): void {
  _cache = null;
  _expires = 0;
  _lastQueryWarnAt = 0;
  _lastJsonWarnAt = 0;
}
