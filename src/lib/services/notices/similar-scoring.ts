/**
 * 相似机会打分（纯函数，无 DB）
 *
 * 口径：两条公告各自的骨架节点码集合里，任取一对节点码取「最长公共前缀对应的层级」作为共享
 *       深度（1 大类 … 5 品目），按权重加权；每个当前节点对同一 peer 只取最深一次，再求和。
 * 为什么不再比 level1_id…level5_id：那五列是旧字典 `crm_unspsc_codes` 的 id 空间，字典只镜像了
 *       UNSPSC 的一部分（品目层 10,661 vs 骨架树 150,006），且桥表 `level` 实测 2~7 ——
 *       旧实现的候选 JOIN 只接住 level 1~5，level 6/7 的码从来没有分支能匹配（缺陷 D-6，
 *       实测影响 77 条公告）。节点码前缀自带层级，深度算式不依赖桥表 level 列，6/7 的码照样有落点。
 * 代表集：宽表 `backbone_path` 是祖先全存的（一条五级链存 5 个码），直接全对全既慢又会让浅层
 *       重复计分。列值祖先全存 ⇒ 取 max 时只需比叶子；当前侧同样只留叶子
 *       （一个码一条贡献，与旧口径「每个当前码计一次」等价）。
 */

import { BACKBONE_NODE_PREFIX, backboneNodeLevel } from "../commodity/backbone-path";

/** 骨架层级权重（越具体越相似，对齐推荐服务 DEPTH_FACTOR） */
export const LEVEL_WEIGHT: Record<number, number> = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0, 5: 1.0 };

/**
 * 单条公告参与打分的代表节点上限。
 * 实测平均 2.4 码/公告（p99.99 才到千级节点，全表只有几十条巨量码公告，最长 5,091 码），
 * 这个上限只在巨量码公告上生效，防的是「候选 2000 条 × 每条几千节点」的全对全。
 */
export const SIMILAR_NODE_CAP = 20;

/** 骨架节点派生行：一条公告挂靠到的一个骨架节点码（由宽表 backbone_path 拆列得到） */
export interface NodeRow {
  notice_id: string;
  node: string;
}

export interface RankedPeer {
  notice_id: string;
  score: number;
}

/** 两个节点码的最深共享层级：层级对祖先单调，浅层不等即停，不会跳层命中 */
export function sharedDepth(a: string, b: string): number {
  const x = String(a ?? "").trim();
  const y = String(b ?? "").trim();
  if (!backboneNodeLevel(x) || !backboneNodeLevel(y)) return 0;
  let d = 0;
  for (let lv = 1; lv <= 5; lv++) {
    const len = BACKBONE_NODE_PREFIX.length + lv * 2;
    if (x.length < len || y.length < len || x.slice(0, len) !== y.slice(0, len)) break;
    d = lv;
  }
  return d;
}

/**
 * 集合里没有后代的节点（去重、升序）。
 * 列值祖先全存 ⇒ 一个节点若有后代，后代一定紧跟在它后面且以它为前缀，扫到第一个不匹配就停。
 * 散码集合（缺链顶，理论上不该出现）原样保留：本函数只去祖先，不因为缺链顶就丢节点。
 */
export function leafNodes(nodes: Iterable<string>): string[] {
  const sorted = [...new Set([...nodes].map((x) => String(x ?? "").trim()).filter((x) => backboneNodeLevel(x) > 0))].sort();
  const out: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    let leaf = true;
    for (let j = i + 1; j < sorted.length; j++) {
      if (!sorted[j].startsWith(cur)) break;
      if (sorted[j].length > cur.length) {
        leaf = false;
        break;
      }
    }
    if (leaf) out.push(cur);
  }
  return out;
}

/**
 * 参与打分的代表节点：叶子 + 上限截断。
 * 截断维度是「深度优先、同层按码序」而不是纯字典序：后者会让巨量码公告的 20 个名额被码最小
 * 的那一支占满，其余整枝消失 —— 共享深度被系统性低估且与真实语义无关。同层仍按码序 ⇒ 可复现。
 */
function representative(nodes: Iterable<string>): string[] {
  const leaves = leafNodes(nodes).sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
  return leaves.slice(0, SIMILAR_NODE_CAP);
}

/** 每个当前代表节点对 peer 取最深共享层级并求和；0 分不入表 */
export function scorePeersByDepth(currentRows: NodeRow[], candidateRows: NodeRow[]): Map<string, number> {
  const scores = new Map<string, number>();
  const current = representative(currentRows.map((r) => r.node));
  if (current.length === 0) return scores;

  const nodesByPeer = new Map<string, string[]>();
  for (const p of candidateRows) {
    const list = nodesByPeer.get(p.notice_id);
    if (list) list.push(p.node);
    else nodesByPeer.set(p.notice_id, [p.node]);
  }

  for (const [pid, nodes] of nodesByPeer) {
    const peer = representative(nodes);
    if (peer.length === 0) continue;
    let sum = 0;
    for (const c of current) {
      // 一个 peer 常有「一告多码」多行，且自 join 无行序保证 → 同一 (当前节点, peer) 取最深，与行序无关
      let best = 0;
      for (const p of peer) {
        const d = sharedDepth(c, p);
        if (d > best) best = d;
      }
      if (best > 0) sum += LEVEL_WEIGHT[best];
    }
    if (sum > 0) scores.set(pid, sum);
  }
  return scores;
}

/** 打分 + 排序（分数降序 → deadline_ts 升序[0/空视为最晚] → notice_id 字典序）→ limit 截断 */
export function rankSimilarPeers(
  currentRows: NodeRow[],
  candidateRows: NodeRow[],
  limit: number,
  deadlineTs: Record<string, number> = {},
): RankedPeer[] {
  const scores = scorePeersByDepth(currentRows, candidateRows);
  const arr = [...scores.entries()].map(([notice_id, score]) => ({ notice_id, score }));
  arr.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = deadlineTs[a.notice_id] || Number.MAX_SAFE_INTEGER;
    const db = deadlineTs[b.notice_id] || Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return a.notice_id < b.notice_id ? -1 : a.notice_id > b.notice_id ? 1 : 0;
  });
  return arr.slice(0, limit);
}
