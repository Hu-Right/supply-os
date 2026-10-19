/**
 * 国家归一 · 服务层解析器（一切以 crm_country_aliases 表为准，无静态兜底）
 *
 * @module server/services/country/resolve
 * @description 归一只认表：命中即用表内 canonical/code/kind；查不到即视为「表不完善」，
 *              由调用方记为 unresolved 去补表，绝不回落任何静态映射或启发式。
 *              多国串按 "," / " - " 拆段，逐段查表；≥2 段命中国家 → 多国，否则视为不可
 *              置信解析（多半是 "国家, 区域" 这类未整串入表的情况）→ unresolved。
 */
import { cleanCountryRaw } from "../../data/countryNames";
import { normalizeCountryKey } from "./alias-store";
import type { CountryAliasSnapshot, CountryAliasEntry } from "./alias-store";

export type { CountryAliasEntry };

/** 一条公告解析结果：命中的国家引用 + 未能解析的原始串（待补表） */
export interface CountryResolve {
  refs: CountryAliasEntry[]; // 去重后的国家引用（含 region/invalid，由调用方按 kind 取舍）
  unresolved: string;        // 整串无法在表中定位时回填（空串表示已解析）
}

function dedupRefs(refs: CountryAliasEntry[]): CountryAliasEntry[] {
  const byCanon = new Map<string, CountryAliasEntry>();
  for (const r of refs) if (!byCanon.has(r.canonical)) byCanon.set(r.canonical, r);
  return [...byCanon.values()];
}

/**
 * 表驱动解析：返回该写法指向的国家引用列表 + 未解析标记。
 * - 整串是表内别名（含 "Canada, British Columbia"→Canada 这类已入表的合法逗号单国）：直接命中；
 * - 否则按分隔符拆段逐段查表：≥2 段命中国家 → 多国；
 * - 都不满足 → unresolved（表缺这条，需补）。
 */
export function resolveCountries(raw: string, snapshot: CountryAliasSnapshot): CountryResolve {
  const cleaned = cleanCountryRaw(raw);
  if (!cleaned) return { refs: [], unresolved: "" };

  const whole = snapshot.byKey.get(normalizeCountryKey(cleaned));
  if (whole) return { refs: [whole], unresolved: "" };

  const parts = cleaned.split(/,| - /).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const hits: CountryAliasEntry[] = [];
    for (const p of parts) {
      const h = snapshot.byKey.get(normalizeCountryKey(p));
      if (h) hits.push(h);
    }
    const countries = hits.filter((h) => h.kind === "country");
    if (countries.length >= 2) return { refs: dedupRefs(countries), unresolved: "" };
  }

  // 表内查不到、又不能置信拆分 → 记为未解析（表不完善，待补行）
  return { refs: [], unresolved: cleaned };
}

/** 便捷：命中的可筛选项（kind=country 且有 ISO2 码）。 */
export function countryCodesOf(res: CountryResolve): string[] {
  return res.refs.filter((r) => r.kind === "country" && r.code).map((r) => r.code!.toUpperCase());
}
export function countryCanonicalsOf(res: CountryResolve): string[] {
  return res.refs.filter((r) => r.kind === "country").map((r) => r.canonical);
}

/** 主国家（第一个 kind=country 引用）；无则 undefined（region/invalid/未解析）。 */
export function primaryCountryOf(raw: string, snapshot: CountryAliasSnapshot): CountryAliasEntry | undefined {
  return resolveCountries(raw, snapshot).refs.find((r) => r.kind === "country");
}

/**
 * 由「国家写法/标准名」取其 ISO2 码（供筛选谓词参数）。大小写/重音/清洗同归一键口径。
 * 非 country 或表里没有 → null（不兜底：调用方据此判定为不可筛）。
 */
export function countryCodeForName(name: string, snapshot: CountryAliasSnapshot): string | null {
  const e = snapshot.byKey.get(normalizeCountryKey(name));
  return e && e.kind === "country" && e.code ? e.code.toUpperCase() : null;
}
