/**
 * 品目路径派生 — UNSPSC 码 → 祖先前缀集合 → 大类集合
 * Commodity Path Derivation
 *
 * @module lib/services/commodity/path
 * @description 「所见即所得」的实现本体：宽表预存每条公告的全部祖先前缀，
 *              用户选中哪一层就等值命中哪一层，**运行期不需要任何层级判断分支**。
 *
 *              三条不可违反的规则（依据见设计 §5.4）：
 *              1. 键是 UNSPSC 数字前缀，不是品目面顺排码 `UGT-C-*`——实测 58/58 段
 *                 两者不同序，且顺排码曾被重排过；UNSPSC 是外部标准，才能当持久化键。
 *              2. 前缀按「两位一组、下一组为 00 即停」展开：段级粗码 41000000 停在 "41"，
 *                 因此选族 4101 命中不到它——招标方只说到段，是正确行为而非漏召回。
 *              3. 不做最短前缀压缩（commodity-code.ts 的 minimalCommodityPrefixes 是
 *                 子树 LIKE 语义，与此相反）；压缩会把 "4101" 收成 "41"，按族筛选静默丢公告。
 *
 *              叶子限量（2026-10-10 实测后的取舍）：有公告单条挂 5,091 个码这类「整本目录打上」的噪声标签，
 *              所以只对 **8 位叶子层**限长（MAX_LEAF_PREFIXES）；2/4/6 位祖先层**无损保留**，
 *              因此选段/选族/选类的结果一丝不差，只有「筛到具体品目」在极端公告上可能不全。
 */
import { groupCodeOfUnspscCode } from "./groups";
import { WIDE_LIMITS } from "../../utils/notice-field-limits";

/** 长度口径引用常量，不得就地字面量（红线 #6 I2） */
const LIST_LIMIT = WIDE_LIMITS.commodityList;

const EIGHT_RE = /^[0-9]{8}$/;

/** 是否为合法 8 位 UNSPSC 码（桥表治理后 code 已 100% 补零归一） */
export function isUnspscEight(value: unknown): value is string {
  return typeof value === "string" && EIGHT_RE.test(value);
}

/** 一个 8 位码的全部有效前缀（含自身），遇全零两位即停 */
export function unspscAncestorPrefixes(code: string): string[] {
  if (!isUnspscEight(code)) return [];
  const out: string[] = [];
  for (let len = 2; len <= 8; len += 2) {
    if (len > 2 && code.slice(len - 2, len) === "00") break;
    out.push(code.slice(0, len));
  }
  return out;
}

/** 8 位叶子（具体品目）前缀的保留上限。只压噪声标签，不影响段/族/类三层。 */
export const MAX_LEAF_PREFIXES = 150;

/** 一条公告的全部 8 位叶子前缀（粗码不产生叶子）；排序后供限量与「被丢弃多少」计数共用一份口径 */
export function leafPrefixesOf(codes: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const c of codes) {
    const chain = unspscAncestorPrefixes(c);
    if (chain.length === 4) set.add(chain[3]); // 链长 4 ⇒ 走到了 8 位
  }
  return [...set].sort();
}

/** 多码合并：全部前缀去重，按（位数, 字典）升序——排序稳定以便逐条对账 */
export function mergeAncestorPrefixes(codes: Iterable<string>, maxLeaf: number = MAX_LEAF_PREFIXES): string[] {
  const ancestors = new Set<string>();
  for (const c of codes) {
    for (const p of unspscAncestorPrefixes(c)) if (p.length < 8) ancestors.add(p);
  }
  const leaves = leafPrefixesOf(codes).slice(0, maxLeaf);
  return [...ancestors, ...leaves].sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/** 多码的大类并集（OR 语义：任一命中即纳入），去重升序 */
export function groupCodesOfCodes(codes: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const c of codes) {
    const g = groupCodeOfUnspscCode(c);
    if (g) set.add(g);
  }
  return [...set].sort();
}

/** 序列化为列值；超限抛错（静默截断 = 漏筛，必须停线人工看） */
export function toPathColumn(values: readonly string[], limit: number = LIST_LIMIT): string {
  const s = values.join(",");
  if (s.length > limit) {
    throw new Error(`品目路径列超长：${s.length} > ${limit}（项数 ${values.length}），拒绝截断写入`);
  }
  return s;
}

/** 列值反解（对账脚本与读取端共用；空串 → 空数组） */
export function parsePathColumn(value: string | null | undefined): string[] {
  const s = String(value ?? "");
  return s ? s.split(",") : [];
}
