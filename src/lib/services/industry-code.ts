/**
 * 行业码制工具 — crm_industry_nodes 码形的单一事实源
 * Industry Code Helpers
 *
 * @module lib/services/industry-code
 * @description 行业面主键 `code` 的形态是 `UGT-I-` + 定长分层数字
 *              （门类 2 位 / 大类 4 位 / 中类 6 位 / 小类与自研 8 位），
 *              并由门禁 I4 钉死「父码 = 自身码去掉末两位」（
 *              scripts/gates/check-taxonomy-invariants.ts）。
 *              于是两件事可以纯字符串完成，不必查库、不必递归 CTE：
 *                - 由叶子码反推祖先链（卡片展示「门类 / 大类 / 中类」路径）；
 *                - 由任意节点码取子树匹配前缀（按行业筛选时选中大类要含其全部子孙）。
 *
 *              ★ 这两个推论的前提是 I4 成立。I4 一旦破坏，check:taxonomy 会先红，
 *                因此本模块不需要在运行期再做结构校验。
 */

/** 行业面码前缀 */
export const INDUSTRY_CODE_PREFIX = "UGT-I-";

/** 树上层级（与 crm_industry_nodes.level 词表一致） */
export type IndustryLevel = "section" | "division" | "group" | "subclass" | "extension";

/** 层级 → 码内数字位数（UGT-I- 之后的位数） */
const DIGITS_BY_LEVEL: Record<IndustryLevel, number> = {
  section: 2,
  division: 4,
  group: 6,
  subclass: 8,
  // 自研延伸层与小数同位数，靠 source 区分，不靠码形
  extension: 8,
};

/** 可作为筛选面/下拉层级的粗层（小类与自研叶子太细，不做导航层） */
export const NAV_INDUSTRIES_LEVELS = ["section", "division", "group"] as const;
export type IndustryNavLevel = (typeof NAV_INDUSTRIES_LEVELS)[number];

const CODE_RE = /^UGT-I-[0-9]{2}(?:[0-9]{2}){0,3}$/;

/** 是否为合法行业码（用于把外部输入挡在 SQL 之前，不参与业务判定） */
export function isIndustryCode(value: unknown): value is string {
  return typeof value === "string" && CODE_RE.test(value);
}

/** 码 → 层级；码形非法返回 null */
export function industryLevelOf(code: string): IndustryLevel | null {
  if (!isIndustryCode(code)) return null;
  const digits = code.length - INDUSTRY_CODE_PREFIX.length;
  switch (digits) {
    case DIGITS_BY_LEVEL.section: return "section";
    case DIGITS_BY_LEVEL.division: return "division";
    case DIGITS_BY_LEVEL.group: return "group";
    default: return null; // 8 位：小类与自研同码长，须回表读 level
  }
}

/**
 * 祖先链（含自身）：门类 → 大类 → 中类 → 自身。
 * 8 位码返回 [section, division, group, self]，其中 self 与 group 之后的一项同为 8 位截断，
 * 因此小类/自研那一项必须回表取 name，不能只靠码长断言层级。
 */
export function industryAncestorCodes(code: string): string[] {
  if (!isIndustryCode(code)) return [];
  const digits = code.length - INDUSTRY_CODE_PREFIX.length;
  const out: string[] = [];
  for (let d = 2; d <= digits; d += 2) {
    out.push(INDUSTRY_CODE_PREFIX + code.slice(INDUSTRY_CODE_PREFIX.length, INDUSTRY_CODE_PREFIX.length + d));
  }
  return out;
}

/**
 * 子树 LIKE 模式（选中某节点要连带其全部子孙的挂靠）。
 *
 * ★ 返回的 `%` 是通配符本体，调用方**不得**再对整串走 escapeLikeWildcard：
 *   转义会把这个 `%` 一起转掉，条件就退化成匹配字面量。
 *   入参必须先过 isIndustryCode（字集只含 `UGT-I-` 与数字，本身不命中任何 LIKE 元字符），
 *   因此「先验合法性」在这里已经替掉了转义要防的东西。
 */
export function industrySubtreeLike(code: string): string {
  return `${code}%`;
}

/**
 * 最短前缀去重：若祖先码已在集合里，丢掉它的子孙码。
 *
 * 为什么需要：关键词「制造」会同时命中门类 03、大类 0326、小类 03260701 等上百个节点，
 * 而它们的子树互相包含——不去重就要拼上百个 LIKE 前缀，且结果集完全重复。
 * 去重后「制造业」只留 `UGT-I-03` 一条，既覆盖整棵子树又能走 idx_code 范围扫描。
 * 上限 40：2026-10-09 真库实测最宽的「机械」（47 个名称命中）去重后也只有 22 条，
 * 40 给后台后续补数留了余量，又不至于让病态关键词把前缀条件数推到伤优化的量级。
 * 入参顺序无关（内部按码长排序），非法码直接丢弃。
 */
export function minimalSubtreePrefixes(codes: Iterable<string>, max = 40): string[] {
  const sorted = [...codes]
    .filter(isIndustryCode)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  const out: string[] = [];
  for (const code of sorted) {
    if (out.some((kept) => code.startsWith(kept))) continue;
    out.push(code);
    if (out.length >= max) break;
  }
  return out;
}

/** 归一化：非法码一律返回空串，供 API 层「非法参数=忽略筛选」而不抛错 */
export function sanitizeIndustryCode(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  return isIndustryCode(v) ? v : "";
}
