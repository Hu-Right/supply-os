/**
 * Incoterms 贸易术语（2010 / 2020）
 *
 * @module shared/constants/incoterms
 * @description 术语必须和版本配套：2020 用 DPU 取代了 2010 的 DAT；且每个术语都必须
 *              带“指定地点/港口”（如 FOB Shanghai、DDP Nairobi），只填 FOB 没有意义。
 */

export const INCOTERM_VERSIONS = ["2020", "2010"] as const;
export type IncotermVersion = (typeof INCOTERM_VERSIONS)[number];

export const INCOTERMS_BY_VERSION: Record<IncotermVersion, readonly string[]> = {
  "2020": ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"],
  "2010": ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAT", "DAP", "DDP"],
};

export const ALL_INCOTERMS = Array.from(
  new Set([...INCOTERMS_BY_VERSION["2020"], ...INCOTERMS_BY_VERSION["2010"]]),
);

export function incotermsForVersion(version: string): readonly string[] {
  return INCOTERMS_BY_VERSION[version as IncotermVersion] ?? INCOTERMS_BY_VERSION["2020"];
}

/** 切换版本时保持语义：2020 DPU ↔ 2010 DAT，其他原样 */
export function migrateIncoterm(term: string, toVersion: string): string {
  if (toVersion === "2020" && term === "DAT") return "DPU";
  if (toVersion === "2010" && term === "DPU") return "DAT";
  return incotermsForVersion(toVersion).includes(term) ? term : "";
}
