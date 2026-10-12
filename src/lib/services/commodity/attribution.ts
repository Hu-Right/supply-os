/**
 * 公告品目归属落点（纯函数，叶子模块）— 归属事实源与派生列的唯一换算面
 * Attribution landing nodes (pure functions, dependency leaf)
 *
 * @module lib/services/commodity/attribution
 * @description 退役 UNSPSC 之后的分工：`crm_notice_attribution_nodes.node_code` 存**最深落点**
 *              （AI 打标产出，或存量由 `backbone_path` 反推的 legacy 落点），宽表 `backbone_path`
 *              仍是派生列，由本模块 `pathOfLandingNodes()` 补全祖先产出，`buildWideRow`
 *              依旧是唯一写入方 —— 事实源换input，ADR-0007「派生列由构建方算」的前提不废。
 *
 *              为什么只存落点、不存祖先链：祖先由节点码唯一决定（`chainOfNode` 纯切片，
 *              BB1 把「父码 = 自身码去掉末两位」钉成不变量）。存两份就是造第二个事实源 ——
 *              树正名或挪归属改一次，落库的旧链就悄悄对不上。与 `crm_commodity_backbone`
 *              不存 level、`crm_notice_backbone_nodes` 不存 precise 是同一条纪律。
 *
 *              为什么本模块不碰 UNSPSC：签名与判据里没有任何 8 位码概念，形制判定只用
 *              `backboneNodeLevel()`。退役完成后公告域不再有「码→树」的换算面，
 *              也就没有第二套落点规则可长（BB10 当年抓的就是这个）。
 *
 * @rules 列形制的解析只走 `fromBackbonePathColumn`（那里点名了全部消费方），不在本文件重拆一遍。
 * @limits 空集 → 空串 → 调用方写 NULL；脏 token 一律不产出、不补猜、不静默丢弃。
 * @see docs/superpowers/specs/2026-10-12-unspsc-full-retirement-design.md（§4.2 组件、§5 三条闸口）
 */
import {
  backboneNodeLevel,
  chainOfNode,
  fromBackbonePathColumn,
  toBackbonePathColumn,
} from "./backbone-path";

/**
 * 列值 → 最深落点集：去掉「集合里还有后代」的那些 token，与 `rootNodes()`（取最浅覆盖集）互为镜像。
 * 存量灌入靠它把 60 万行派生列压回事实（一条公告可压出多个落点，分属不同链）。
 * 判据只有一条：节点码 = `UGT-B-` + 逐层增长的数字前缀，所以「更深」等价「以它为前缀」，
 * 不必回表取 parent_code。
 */
export function leafNodesOfPathColumn(value: unknown): string[] {
  const set = fromBackbonePathColumn(value);
  const out: string[] = [];
  for (const x of set) {
    if (!set.some((y) => y !== x && y.startsWith(x))) out.push(x);
  }
  return [...new Set(out)].sort();
}

/**
 * 落点集 → 含全部祖先的节点码集（升序去重），即宽表列值的形状。
 * 非法形制直接跳过（不猜层级）；空集返回空集，调用方据此写 NULL。
 */
export function pathOfLandingNodes(nodes: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const node of nodes) {
    if (backboneNodeLevel(node) <= 0) continue;
    for (const chain of chainOfNode(node)) out.add(chain);
  }
  return [...out].sort();
}

/**
 * 列值 → 落点 → 列值的闭包（对账闸口 1 与门禁 BB15c 共用这一份，不另写第二份）。
 * 相等 ⇒ 这一行可以被落点表无损接管；不相等 ⇒ 脏列（断档 / 多写 / 混进非节点码 token，
 * 常见于 ops 手工灌过的行），必须抓出来人工定 —— 灌入时顺手"修好"等于拿脏存量改掉现网归属。
 */
export function closureOfPathColumn(value: unknown): string {
  return toBackbonePathColumn(pathOfLandingNodes(leafNodesOfPathColumn(value)));
}

/**
 * 落点写入前的形制闸口：非法即抛，绝不放行、也绝不静默跳过。
 * 与 `assertBackbonePathLength` 同一纪律——超长与脏码都要么报一个可定位的错，要么不落笔；
 * 把脏行归进 misses 悄然丢弃，等于让公告在新树上“看起来不存在”（相似公告脏码事故的同一类）。
 * 故意不 trim（沿用 `backboneNodeLevel` 的口径）：带空白的入参宁可判非法，
 * 这里多一次 trim 就会把脏键放进事实源。
 */
export function assertAttributionNode(node: unknown, noticePk: number | string): string {
  const v = typeof node === "string" ? node : "";
  if (backboneNodeLevel(v) <= 0) {
    throw new Error(`落点形制非法：公告 ${noticePk} 的节点码「${JSON.stringify(node)}」不是 UGT-B- 合法层级码`);
  }
  return v;
}
