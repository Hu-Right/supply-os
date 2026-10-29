/**
 * 投标可行性报告 —— 最小知识表（v0.1）
 *
 * @module lib/services/feasibility-report/knowledge
 * @description 认证体系等效、单位换算、最小准备期等"确定性知识"。
 *              等效关系只是"可解释的候选"，命中后仍需人工确认（partial），不直接判 satisfied。
 *              后续应迁到可维护的运营配置（v0.2/v0.3），v0.1 先内置最小集。
 */

/** 证书体系等效表：code → 可视为等效的别名（含中文名/国标号） */
const CERT_EQUIVALENCE: Record<string, string[]> = {
  ISO9001: ["GB/T19001", "GB/T 19001", "质量管理体系认证"],
  ISO14001: ["GB/T24001", "GB/T 24001", "环境管理体系认证"],
  ISO45001: ["GB/T45001", "GB/T 45001", "职业健康安全管理体系认证"],
  ISO27001: ["GB/T22080", "信息安全管理体系认证"],
  CE: ["UKCA", "EN1090", "EN 1090"],
  ISO3834: ["EN1090", "EN 1090", "焊接质量体系认证"],
};

/** 单位换算（统一到基准单位；数值 × factor = 基准值） */
const UNIT_TABLE: Record<string, { base: string; factor: number }> = {
  // 长度（基准 mm）
  mm: { base: "mm", factor: 1 },
  cm: { base: "mm", factor: 10 },
  m: { base: "mm", factor: 1000 },
  inch: { base: "mm", factor: 25.4 },
  in: { base: "mm", factor: 25.4 },
  // 功率（基准 kW）
  w: { base: "kw", factor: 0.001 },
  kw: { base: "kw", factor: 1 },
  mw: { base: "kw", factor: 1000 },
  // 重量（基准 kg）
  g: { base: "kg", factor: 0.001 },
  kg: { base: "kg", factor: 1 },
  t: { base: "kg", factor: 1000 },
  ton: { base: "kg", factor: 1000 },
  // 天数
  day: { base: "day", factor: 1 },
  days: { base: "day", factor: 1 },
  week: { base: "day", factor: 7 },
  weeks: { base: "day", factor: 7 },
  month: { base: "day", factor: 30 },
  months: { base: "day", factor: 30 },
};

/** 归一化证书编码：去空格/点/横线，统一大写 */
export function normalizeCertCode(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[\s.\-_/]/g, "");
}

/** 返回与给定证书编码语义等效的编码集合（含自身），用于"候选等效"判断 */
export function equivalentCertCodes(code: string | null | undefined): string[] {
  const norm = normalizeCertCode(code);
  if (!norm) return [];
  const result = new Set<string>([norm]);
  const aliases = CERT_EQUIVALENCE[norm] ?? [];
  for (const alias of aliases) result.add(normalizeCertCode(alias));
  // 反向查找：若给定的是别名，也能找到主码
  for (const [main, list] of Object.entries(CERT_EQUIVALENCE)) {
    if (list.some((alias) => normalizeCertCode(alias) === norm)) {
      result.add(main);
      for (const alias of list) result.add(normalizeCertCode(alias));
    }
  }
  return Array.from(result);
}

/** 判断两个证书编码是否"完全一致"（归一化后） */
export function sameCertCode(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCertCode(a);
  const nb = normalizeCertCode(b);
  return !!na && na === nb;
}

/** 判断两个证书编码是否"等效但不同名"（需要人工确认） */
export function equivalentButDifferent(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCertCode(a);
  const nb = normalizeCertCode(b);
  if (!na || !nb || na === nb) return false;
  return equivalentCertCodes(na).includes(nb) && equivalentCertCodes(nb).includes(na);
}

/** 数值 + 单位 → 基准单位值；无法换算返回 null */
export function toBaseUnit(value: number, unit: string | null | undefined): { base: string; value: number } | null {
  const u = String(unit ?? "").trim().toLowerCase();
  const entry = UNIT_TABLE[u];
  if (!entry) return null;
  return { base: entry.base, value: value * entry.factor };
}

/** 比较两个带单位的数值：返回 -1/0/1，无法比较返回 null */
export function compareWithUnit(
  a: { value: number; unit?: string | null },
  b: { value: number; unit?: string | null },
): number | null {
  const left = toBaseUnit(a.value, a.unit);
  const right = toBaseUnit(b.value, b.unit);
  if (!left || !right || left.base !== right.base) return null;
  if (left.value === right.value) return 0;
  return left.value > right.value ? 1 : -1;
}

/** 默认最小投标准备天数（低于则计入风险，不直接否决） */
export const DEFAULT_MIN_PREP_DAYS = 7;

/** 默认评分阈值 */
export const DEFAULT_SCORE_THRESHOLD = 0.55;

/** 规则版本（写进报告 meta，便于回归对比） */
export const RULES_VERSION = "rules-v0.1";
