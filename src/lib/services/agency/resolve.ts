/**
 * 机构展示 · 单一解析入口（数据驱动：别名表为准，正则模式为长尾确定性兜底）
 *
 * @module server/services/agency/resolve
 * @description 全项目唯一的「原始机构写法 → 展示用 canonical + i18n」口径，供下拉(query)
 *              与卡片(format)共用，消除两处各写一遍导致的展示漂移。优先级：
 *              ① agency_aliases 命中 → canonical 恒取表、i18n 取表；表有 canonical 但无多语名 → i18n 用模式补；
 *              ② 未命中 → translateByPattern（确定性规则）；③ 再无 → 原样、i18n 空。
 *              同时输出 i18nFrom 标明译名来自表还是模式，供调用方决定取舍。
 *              读表仍只经 alias-store 唯一入口；本文件不自建 SQL。
 */
import type { Pool } from "mysql2/promise";
import { loadAgencyAliasSnapshot, normalizeAliasKey, type AgencyAliasSnapshot } from "./alias-store";
import { translateByPattern } from "../../data/agency-i18n/translate";

export interface AgencyDisplay { canonical: string; i18n: Record<string, string> | null; i18nFrom: AgencyI18nSource }

/**
 * i18n 的来源。区分它是必要的：别名表登记名是人工核验过的专名译名，而模式合成名
 * 只是「整串原文 + 末尾类型词译中」的机械拼接（如 "LAND REGISTRATION管理局"），
 * 列表上用它胜得过空白桶名，详情上却不如直接给真实买家名——两者需要不同的取舍。
 */
export type AgencyI18nSource = "alias" | "pattern" | null;

const EMPTY_SNAP: AgencyAliasSnapshot = { byAlias: new Map() };
const hasAnyI18n = (i?: Record<string, string> | null): boolean => !!i && Object.values(i).some((v) => v && v.trim());

/** 纯解析：给定快照 + 原始写法 → 展示 canonical 与 i18n。 */
export function resolveAgencyDisplayWith(raw: string, snap: AgencyAliasSnapshot): AgencyDisplay {
  const s = String(raw ?? "").trim();
  if (!s) return { canonical: "", i18n: null, i18nFrom: null };
  const e = snap.byAlias.get(normalizeAliasKey(s));
  if (e) {
    let i18n: Record<string, string> | null = hasAnyI18n(e.i18n) ? e.i18n! : null;
    let i18nFrom: AgencyI18nSource = i18n ? "alias" : null;
    if (!i18n) {
      // 表有 canonical、缺多语名 → 模式补（补出来的不是人工译名，来源记 pattern）
      const p = translateByPattern(s);
      if (p?.i18n) { i18n = p.i18n; i18nFrom = "pattern"; }
    }
    return { canonical: e.canonical, i18n, i18nFrom };
  }
  const p = translateByPattern(s);
  if (p) return { canonical: p.canonical || s, i18n: p.i18n ?? null, i18nFrom: p.i18n ? "pattern" : null };
  return { canonical: s, i18n: null, i18nFrom: null };
}

let _snap: AgencyAliasSnapshot | null = null;

/** 预热/刷新快照引用（复用 alias-store 缓存）。异步入口先 await 它，之后同步 resolveAgencyDisplay 生效。 */
export async function ensureAgencyDisplaySnapshot(pool: Pool): Promise<void> {
  _snap = await loadAgencyAliasSnapshot(pool);
}

/** 同步解析（用已预热快照；未就绪按表未命中处理，退回模式/原样，不产生错误数据）。 */
export function resolveAgencyDisplay(raw: string): AgencyDisplay {
  return resolveAgencyDisplayWith(raw, _snap ?? EMPTY_SNAP);
}

/**
 * 快照是否已就绪（只读判定，不查库）。
 * 热路径（每次检索）用它做门控：就绪就零成本跳过，避免每 10 分钟 TTL 到期时
 * 在请求路径上反复重读 agency_aliases；未就绪才交给异步预热出口。
 */
export function isAgencyDisplaySnapshotReady(): boolean {
  return _snap !== null;
}

/** 仅测试用：注入/清空快照。 */
export function __setAgencyDisplaySnapshotForTest(s: AgencyAliasSnapshot | null): void {
  _snap = s;
}
