/**
 * 机构展示 · 单一解析入口（数据驱动：别名表为准，正则模式为长尾确定性兜底）
 *
 * @module server/services/agency/resolve
 * @description 全项目唯一的「原始机构写法 → 展示用 canonical + i18n」口径，供下拉(query)
 *              与卡片(format)共用，消除两处各写一遍导致的展示漂移。优先级：
 *              ① agency_aliases 命中 → canonical 恒取表、i18n 取表；表有 canonical 但无多语名 → i18n 用模式补；
 *              ② 未命中 → translateByPattern（确定性规则）；③ 再无 → 原样、i18n 空。
 *              读表仍只经 alias-store 唯一入口；本文件不自建 SQL。
 */
import type { Pool } from "mysql2/promise";
import { loadAgencyAliasSnapshot, normalizeAliasKey, type AgencyAliasSnapshot } from "./alias-store";
import { translateByPattern } from "../../data/agency-i18n/translate";

export interface AgencyDisplay { canonical: string; i18n: Record<string, string> | null }

const EMPTY_SNAP: AgencyAliasSnapshot = { byAlias: new Map() };
const hasAnyI18n = (i?: Record<string, string> | null): boolean => !!i && Object.values(i).some((v) => v && v.trim());

/** 纯解析：给定快照 + 原始写法 → 展示 canonical 与 i18n。 */
export function resolveAgencyDisplayWith(raw: string, snap: AgencyAliasSnapshot): AgencyDisplay {
  const s = String(raw ?? "").trim();
  if (!s) return { canonical: "", i18n: null };
  const e = snap.byAlias.get(normalizeAliasKey(s));
  if (e) {
    let i18n: Record<string, string> | null = hasAnyI18n(e.i18n) ? e.i18n! : null;
    if (!i18n) i18n = translateByPattern(s)?.i18n ?? null; // 表有 canonical、缺多语名 → 模式补
    return { canonical: e.canonical, i18n };
  }
  const p = translateByPattern(s);
  if (p) return { canonical: p.canonical || s, i18n: p.i18n ?? null };
  return { canonical: s, i18n: null };
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

/** 仅测试用：注入/清空快照。 */
export function __setAgencyDisplaySnapshotForTest(s: AgencyAliasSnapshot | null): void {
  _snap = s;
}
