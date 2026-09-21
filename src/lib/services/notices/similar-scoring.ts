/**
 * 相似机会打分（纯函数，无 DB）
 *
 * 口径：对每个「当前公告的码」，找到它与某 peer 共享的**最深** UNSPSC 层级
 * （level1_id…level5_id 相等），按层级权重计分，再对所有当前码求和。
 * 权重对齐推荐服务 DEPTH_FACTOR（越具体越相似），L5 并入 1.0。
 */

/** 层级 → 权重（1 最浅/大类，5 最深/细类） */
export const LEVEL_WEIGHT: Record<number, number> = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0, 5: 1.0 };

/** 桥接表最小行形状（仅打分所需） */
export interface BridgeRow {
  notice_id: string;
  level1_id?: string | number | null;
  level2_id?: string | number | null;
  level3_id?: string | number | null;
  level4_id?: string | number | null;
  level5_id?: string | number | null;
}

export interface RankedPeer {
  notice_id: string;
  score: number;
}

const norm = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? "" : String(v).trim();

/** 每个当前码对 peer 取最深命中层级权重并求和；0 分不入表 */
export function scorePeersByDepth(currentRows: BridgeRow[], candidateRows: BridgeRow[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const c of currentRows) {
    const cIds = [norm(c.level1_id), norm(c.level2_id), norm(c.level3_id), norm(c.level4_id), norm(c.level5_id)];
    // 一个 peer 常有「一告多码」多行，且自 join 无行序保证 → 对同一 (当前码, peer) 取最深命中层级，与行序无关
    const bestByPeer = new Map<string, number>();
    for (const p of candidateRows) {
      let depth = 0;
      for (let L = 1; L <= 5; L++) {
        const cid = cIds[L - 1];
        const pid = norm(p[`level${L}_id` as keyof BridgeRow] as string | number | null);
        if (cid && pid && cid === pid) depth = L;
      }
      if (depth > 0) bestByPeer.set(p.notice_id, Math.max(bestByPeer.get(p.notice_id) || 0, depth));
    }
    for (const [pid, d] of bestByPeer) scores.set(pid, (scores.get(pid) || 0) + LEVEL_WEIGHT[d]);
  }
  return scores;
}

/** 打分 + 排序（分数降序 → deadline_ts 升序[0/空视为最晚] → notice_id 字典序）→ limit 截断 */
export function rankSimilarPeers(
  currentRows: BridgeRow[],
  candidateRows: BridgeRow[],
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
