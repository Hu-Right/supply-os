/**
 * 融合树码制单点 — `UGT-` + 每层 3 位定宽，码长即层级、更深 = 以它为前缀。
 * Fusion Commodity Code Helpers
 *
 * @module lib/services/commodity/fusion-path
 * @description 与旧 `backbone-path.ts`（`UGT-B-` / 2 位 / 5 层硬顶）物理隔离：融合码前缀纯数字起头，
 *              旧码带字母（B/C/G），两套正则天然互斥，杜绝脏混。层数无硬顶、单父最多 999 子。
 *              全库融合形制判定只走本文件（对齐 backbone-path 的单点纪律）：一旦有人手写
 *              `split(",")` 或 `startsWith("UGT-")`，形制改了就会逐处静默失效。
 *              祖先链推导 / 子树前缀匹配 / 归因压最深链尾均为纯字符串，不查库、不递归 CTE。
 */

/** 融合节点码前缀 */
export const FUSION_NODE_PREFIX = "UGT-";

/** 每层位数（3 位/层 → 单父最多 999 子；码长即层级） */
const DIGITS_PER_LEVEL = 3;

/** 前缀字符数（`UGT-` = 4） */
const PREFIX_LEN = FUSION_NODE_PREFIX.length;

/** 合法融合码正则：`UGT-` 后接 3 的倍数个数字（至少一层） */
const NODE_RE = /^UGT-\d{3}(\d{3})*$/;

/** 是否为合法融合节点码（把外部输入挡在 SQL 之前，不参与业务判定） */
export function isFusionNode(value: unknown): value is string {
  return typeof value === "string" && NODE_RE.test(value);
}

/**
 * 码 → 层级（1 起，L1=大类）；非法码返回 0。
 * 码长即层级：`level = (len - 4) / 3`，无需回表。
 */
export function fusionNodeLevel(code: unknown): number {
  if (!isFusionNode(code)) return 0;
  return (code.length - PREFIX_LEN) / DIGITS_PER_LEVEL;
}

/**
 * 祖先链（含自身）：逐 3 位前移即得各级祖先码。
 * 非法码返回空数组。
 */
export function chainOfFusionNode(node: unknown): string[] {
  if (!isFusionNode(node)) return [];
  const body = node.slice(PREFIX_LEN);
  const out: string[] = [];
  for (let len = DIGITS_PER_LEVEL; len <= body.length; len += DIGITS_PER_LEVEL) {
    out.push(FUSION_NODE_PREFIX + body.slice(0, len));
  }
  return out;
}

/**
 * 子树 LIKE 模式（选中某节点要连带其全部子孙）。
 * ★ 返回的 `%` 是通配符本体，调用方不得再对整串走 escapeLikeWildcard。
 *   入参须先过 isFusionNode（字符集仅 `UGT-` 与数字，本身不命中 LIKE 元字符）。
 */
export function fusionSubtreeLike(code: string): string {
  return `${code}%`;
}

/**
 * 最短前缀去重：若祖先码已在集合里，丢掉它的子孙码。
 * 入参顺序无关（内部按码长排序），非法码直接丢弃。
 */
export function minimalFusionPrefixes(codes: Iterable<string>, max = 40): string[] {
  const sorted = [...codes]
    .filter(isFusionNode)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  const out: string[] = [];
  for (const code of sorted) {
    if (out.some((kept) => code.startsWith(kept))) continue;
    out.push(code);
    if (out.length >= max) break;
  }
  return out;
}

/** 融合路径列长度上限（深链更长，与现网 mediumtext 承载一致；对齐 BACKBONE_PATH_LIMIT 量级） */
export const FUSION_PATH_LIMIT = 1_000_000;

/** 节点集 → 列值（去重、按码升序、逗号分隔）；写出端唯一形制口径 */
export function toFusionPathColumn(nodes: Iterable<string>): string {
  const uniq = [...new Set([...nodes].filter(isFusionNode))].sort();
  return uniq.join(",");
}

/**
 * 列值 → 合法节点码数组（`toFusionPathColumn` 的逆操作）：NULL/空串 → 空数组，去重，
 * 只留 `UGT-` 形制的 token。读取端拆列**只走这里**：手写 split 的地方一多，
 * 列形制改了就会逐处静默失效。
 */
export function fromFusionPathColumn(col: unknown): string[] {
  if (col === null || col === undefined || col === "") return [];
  return [...new Set(String(col).split(",").map((s) => s.trim()).filter(isFusionNode))];
}

/**
 * 列值 → 最深链尾：丢弃任何作为其它码祖先的码（`minimalFusionPrefixes` 的反向，
 * 那边留最短祖先、这里留最深叶子），供归因/匹配分取落点。
 * 脏 token 已在 fromFusionPathColumn 被挡，绝不产出、不猜测。
 */
export function leafNodesOfFusionPathColumn(col: unknown): string[] {
  const nodes = fromFusionPathColumn(col);
  return nodes.filter((c) => !nodes.some((d) => d !== c && d.startsWith(c)));
}

/**
 * 写库前长度闸：超长抛错（打断而非截断）。
 * 列值一律无损：超上限只可能是常量与库漂移 ⇒ 拒写、停线、人工看，不得截断。
 */
export function assertFusionPathLength(value: string, noticeId: string | number): string {
  if (value.length > FUSION_PATH_LIMIT) {
    throw new Error(`融合路径超长：公告 ${noticeId} ${value.length} 字符 > ${FUSION_PATH_LIMIT}`);
  }
  return value;
}
