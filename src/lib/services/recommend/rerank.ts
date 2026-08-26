/**
 * 推荐重排层
 * Recommendation reranking: MMR diversity + reco reasons + text bonus
 *
 * @module server/services/recommend/rerank
 */

const MMR_LAMBDA = 0.7;
const HIGH_VALUE_USD = 1_000_000;

/**
 * MMR 页内重排：reco_score 与已选公告 UNSPSC 码 Jaccard 相似度的权衡
 */
export function mmrRerankPage(pageRows: any[]): any[] {
  if (pageRows.length <= 2) return pageRows;
  const codeSets = pageRows.map((row) => new Set(String(row.codes_concat || "").split(",").filter(Boolean)));
  const jaccard = (a: Set<string>, b: Set<string>) => {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0; for (const code of a) if (b.has(code)) inter++;
    return inter / (a.size + b.size - inter);
  };
  const remaining = pageRows.map((_, index) => index);
  const picked: number[] = [];
  while (remaining.length) {
    let bestPos = 0; let bestScore = -Infinity;
    for (let pos = 0; pos < remaining.length; pos++) {
      const index = remaining[pos]; let maxSim = 0;
      for (const chosen of picked) { const sim = jaccard(codeSets[index], codeSets[chosen]); if (sim > maxSim) maxSim = sim; }
      const score = MMR_LAMBDA * Number(pageRows[index].reco_score || 0) - (1 - MMR_LAMBDA) * maxSim;
      if (score > bestScore) { bestScore = score; bestPos = pos; }
    }
    picked.push(remaining[bestPos]); remaining.splice(bestPos, 1);
  }
  return picked.map((index) => pageRows[index]);
}

/**
 * 推荐原因标注：L4 行业命中 > 临期 > 高价值，最多两条
 */
export function buildRecoReasons(row: any, nowSec: number): string[] {
  const reasons: string[] = [];
  const deadlineSec = row.deadline_ts == null ? null
    : Number(row.deadline_ts) > 100000000000 ? Math.floor(Number(row.deadline_ts) / 1000) : Number(row.deadline_ts);
  if (Number(row.l4_hit || 0) > 0) reasons.push("industry_match_l4");
  if (deadlineSec !== null && deadlineSec >= nowSec && deadlineSec <= nowSec + 30 * 86400) reasons.push("recent_deadline");
  if (Number(row.amount_usd_cached || 0) >= HIGH_VALUE_USD) reasons.push("high_value");
  if (reasons.length === 0) reasons.push("industry_match");
  return reasons.slice(0, 2);
}
