/**
 * 品目码制工具 — crm_commodity_nodes 码形的单一事实源
 * Commodity Code Helpers
 *
 * @module lib/services/commodity-code
 * @description 品目面 `code` = `UGT-C-` + 定长分层数字（板块 2 / 族 4 / 类 6 / 品目 8 / 自研 10 位），
 *              码长即层级且五层互不重叠，故祖先链推导与子树前缀匹配均可由纯字符串完成，
 *              不必查库、不必递归 CTE。前提：门禁 check:taxonomy 的 C 段把
 *              「码长即层级、父码=去末两级」钉成不变量（本模块运行期不再做结构校验）。
 */

/** 品目面码前缀 */
export const COMMODITY_CODE_PREFIX = "UGT-C-";

/** 树上层级（与 crm_commodity_nodes.level 词表一致） */
export type CommodityLevel = "segment" | "family" | "class" | "commodity" | "extension";

/** 位数 → 层级（五层码长互异，可无歧义反推：2/4/6/8/10 位 = 板块/族/类/品目/自研） */
const LEVEL_BY_DIGITS: Record<number, CommodityLevel> = {
  2: "segment",
  4: "family",
  6: "class",
  8: "commodity",
  10: "extension",
};

/** 可作为筛选面/下拉层级的粗层（品目与自研叶子太细，不做导航层） */
export const NAV_COMMODITY_LEVELS = ["segment", "family", "class"] as const;
export type CommodityNavLevel = (typeof NAV_COMMODITY_LEVELS)[number];

const CODE_RE = /^UGT-C-[0-9]{2}(?:[0-9]{2}){0,4}$/;

/** 是否为合法品目码（把外部输入挡在 SQL 之前，不参与业务判定） */
export function isCommodityCode(value: unknown): value is string {
  return typeof value === "string" && CODE_RE.test(value);
}

/** 码 → 层级；非法码返回 null；五层码长互异，无需回表 */
export function commodityLevelOf(code: string): CommodityLevel | null {
  if (!isCommodityCode(code)) return null;
  return LEVEL_BY_DIGITS[code.length - COMMODITY_CODE_PREFIX.length] ?? null;
}

/**
 * 祖先链（含自身）：板块 → 族 → 类 → 品目 →（自研）。
 * 码长即层级，故逐 2 位截断即得各级祖先码。
 */
export function commodityAncestorCodes(code: string): string[] {
  if (!isCommodityCode(code)) return [];
  const digits = code.length - COMMODITY_CODE_PREFIX.length;
  const body = code.slice(COMMODITY_CODE_PREFIX.length);
  const out: string[] = [];
  for (let d = 2; d <= digits; d += 2) {
    out.push(COMMODITY_CODE_PREFIX + body.slice(0, d));
  }
  return out;
}

/**
 * 子树 LIKE 模式（选中某节点要连带其全部子孙）。
 * ★ 返回的 `%` 是通配符本体，调用方不得再对整串走 escapeLikeWildcard。
 *   入参须先过 isCommodityCode（字符集仅 `UGT-C-` 与数字，本身不命中 LIKE 元字符）。
 */
export function commoditySubtreeLike(code: string): string {
  return `${code}%`;
}

/**
 * 最短前缀去重：若祖先码已在集合里，丢掉它的子孙码。
 * 入参顺序无关（内部按码长排序），非法码直接丢弃。
 */
export function minimalCommodityPrefixes(codes: Iterable<string>, max = 40): string[] {
  const sorted = [...codes]
    .filter(isCommodityCode)
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
export function sanitizeCommodityCode(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  return isCommodityCode(v) ? v : "";
}
