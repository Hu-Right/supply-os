/**
 * 融合树 · 归属解析内核（纯函数，零查库、零现网）
 * Fusion Crosswalk Resolver
 *
 * @module lib/services/commodity/fusion-xwalk
 * @description 把"公告身上的一堆原始标准码"经 approved xwalk 解析成"融合节点集 + 野码"，再展开成路径列值。
 *   这是 fusion-reattribute 工具与门禁 FU6 重算对拍共用的同一份口径（单点，防两处实现漂移）。
 *   匹配按 `normalizeStdCode` 去补位后的有效码比较：`100120` 与 `10012000` 归一到同一 class sig，两侧同则命中。
 *   未命中/非法/pending 一律记野码，交 intake，绝不猜挂。
 * @note 纯函数：输入 xwalk 行 + 原始码，输出节点/路径/野码；不碰 DB。
 */
import { chainOfFusionNode, toFusionPathColumn } from "./fusion-path";
import { normalizeStdCode, type StdKey } from "./fusion-standards";

export interface XwalkRow {
  node_code: string;
  std: StdKey;
  std_code: string;
  status?: "pending" | "approved";
}

/** 原始码（带标准来源），如公告桥表里的 UNSPSC 码 */
export interface RawCode {
  std: StdKey;
  code: string;
}

/** 匹配键：`std:有效码`；非法码返回 null */
function matchKey(std: StdKey, code: string): string | null {
  const info = normalizeStdCode(std, code);
  return info.level === 0 ? null : `${std}:${info.sig}`;
}

/**
 * 建索引：仅收 approved 行、去补位归一；一码一爹由上游 UNIQUE 保证，此处重复者后者覆盖并计数供体检。
 * 返回 Map 与重复计数（dup>0 说明账本被写脏，须回查）。
 */
export function buildXwalkIndex(rows: XwalkRow[]): { index: Map<string, string>; dup: number } {
  const index = new Map<string, string>();
  let dup = 0;
  for (const r of rows) {
    if (r.status && r.status !== "approved") continue;
    const k = matchKey(r.std, r.std_code);
    if (!k) continue;
    if (index.has(k)) dup += 1;
    index.set(k, r.node_code);
  }
  return { index, dup };
}

/** 解析一批原始码 → 命中节点集 + 野码（未命中/非法） */
export function resolveNoticeCodes(
  rawCodes: RawCode[],
  index: Map<string, string>,
): { nodes: string[]; wild: string[] } {
  const nodes = new Set<string>();
  const wild: string[] = [];
  for (const { std, code } of rawCodes) {
    const k = matchKey(std, code);
    const node = k ? index.get(k) : undefined;
    if (node) nodes.add(node);
    else wild.push(`${std}:${code}`);
  }
  return { nodes: [...nodes], wild };
}

/**
 * 端到端：原始码 → 融合路径列值（含全部祖先、去重升序）+ 落点叶子 + 野码。
 * 命中为空 ⇒ path="" 且 nodes=[]（以树为准：全码换不出则留空，属预期，不算错）。
 */
export function planNoticePath(rawCodes: RawCode[], index: Map<string, string>): { path: string; nodes: string[]; wild: string[] } {
  const { nodes, wild } = resolveNoticeCodes(rawCodes, index);
  const expanded = nodes.flatMap(chainOfFusionNode);
  return { path: toFusionPathColumn(expanded), nodes, wild };
}
