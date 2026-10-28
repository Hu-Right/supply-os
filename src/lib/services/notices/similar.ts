/**
 * 相似公告（纯品类语义相似，口径 = 品目骨架节点码）
 *
 * 流程：内部 id → 当前公告的骨架节点码集 → 按码深度分档取共享码 peer 候选（活跃、排除自身）
 *      → 节点码最长公共前缀加权打分排序 → 水合为列表项。
 * 无码 / 无候选 → 直接返回空数组，不做任何兜底。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ACTIVE_NOTICE_WHERE } from "../../utils/notice-expired";
import { fetchDetailsByIds } from "../search-orchestrator/detail-fetch";
import { formatItems } from "../search-orchestrator/format";
import { backboneNodeLevel, fromBackbonePathColumn } from "../commodity/backbone-path";
import { rankSimilarPeers, type NodeRow } from "./similar-scoring";
import { NOTICE_NODES_TABLE } from "../search-sync/notice-nodes";

/** 候选上限：一条公告最多拿多少个 peer 去打分 */
const CANDIDATE_LIMIT = 2000;
/** 一次 IN 列表的码数：走 idx_node 等值探测，语句过长无益 */
const CODE_CHUNK = 200;
/** 一轮检索最多发的候选查询数：巨量码公告（实测最长 5,091 码）的兜底闸门 */
const MAX_CANDIDATE_QUERIES = 12;

/**
 * 把当前公告的节点码按深度分档（L4/L5 细码 → L3 小类 → L2 中类），返回三档节点码列表。
 * 小表剥离后候选检索改走倒排表 UGT 节点（不再读桥表的旧品类码），
 * 深度即码长（BB1），L1 大类过宽不进检索。只决定候选检索的优先级，不改归属口径。
 */
function nodesByDepth(nodes: string[]): string[][] {
  const fine: string[] = [];
  const fam: string[] = [];
  const seg: string[] = [];
  for (const node of nodes) {
    const lv = backboneNodeLevel(node);
    if (lv >= 4) fine.push(node);
    else if (lv === 3) fam.push(node);
    else if (lv === 2) seg.push(node);
  }
  return [fine, fam, seg].filter((t) => t.length > 0);
}

/** 步骤 1-4：返回按相似度排序的 peer 内部主键 notice_pk（=bid_notices.id=服务表主键，最多 limit 个） */
export async function findSimilarNoticeIds(pool: Pool, noticeDbId: number, limit: number): Promise<number[]> {
  // 候选水合与打分侧都要外部编号，先换出来
  const [idRows] = await pool.query<RowDataPacket[]>(
    "SELECT notice_id FROM bid_notices n WHERE n.id = ? LIMIT 1",
    [noticeDbId],
  );
  const currentNoticeId = idRows[0]?.notice_id as string | undefined;
  if (!currentNoticeId) return [];

  // 当前公告的节点码：宽表派生列按主键点查（与筛选谓词同一列，不存在第二份口径）
  const [curWide] = await pool.query<RowDataPacket[]>(
    `SELECT backbone_path p FROM notice_search WHERE id = ? LIMIT 1`,
    [noticeDbId],
  );
  if (curWide.length === 0) {
    // 公告根本没进宽表：这与「有行但无码」不同，是同步缺位，必须叫出来不能静默当无相似
    console.warn(`[similar] 公告 id=${noticeDbId} 在宽表里没有行，相似直接返回空`);
    return [];
  }
  const currentNodes = fromBackbonePathColumn(curWide[0]?.p);
  if (currentNodes.length === 0) return []; // 无码（含平台 RFQ）→ 空，不兜底

  const tiers = nodesByDepth(currentNodes);
  if (tiers.length === 0) return [];

  // 候选：共享同一个 UGT 节点的公告（倒排表 `node IN` 等值走 idx_node）。
  // 小表剥离：不再经桥表旧品类码中转（那批码本身大量失真），直接按节点码找 peer，
  // 与候选打分、筛选谓词同一条 UGT 口径。
  // 分档取而不是一句 LIMIT 2000 兜住：实测单节点出现量巨大的粗节点会灌满窗口，
  // 不分档时精细节点的 peer 一个都进不来。
  const peers = new Map<string, { wideId: number; deadline: number }>();
  let queries = 0;
  for (const tier of tiers) {
    for (let i = 0; i < tier.length && peers.size < CANDIDATE_LIMIT && queries < MAX_CANDIDATE_QUERIES; i += CODE_CHUNK) {
      const chunk = tier.slice(i, i + CODE_CHUNK);
      queries++;
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT n.notice_id AS notice_id,
                n.id AS wide_id,
                MAX(n.deadline_ts) AS deadline_ts
         FROM ${NOTICE_NODES_TABLE} peer
         JOIN bid_notices n ON n.id = peer.notice_id AND ${ACTIVE_NOTICE_WHERE}
         WHERE peer.notice_id <> ? AND peer.node IN (${chunk.map(() => "?").join(",")})
         GROUP BY n.notice_id, n.id
         LIMIT ${CANDIDATE_LIMIT - peers.size}`,
        [noticeDbId, ...chunk],
      );
      // 先入者优先：档序已经保证「共享品目/子类的 peer 排在共享中类的 peer 之前」
      for (const r of rows) {
        const nid = String(r.notice_id);
        if (!peers.has(nid)) peers.set(nid, { wideId: Number(r.wide_id), deadline: Number(r.deadline_ts || 0) });
      }
    }
    if (peers.size >= CANDIDATE_LIMIT) break;
  }
  if (peers.size === 0) return [];

  // 候选的节点码：宽表拿主键批量点查（宽表没得 notice_id 索引，别拿外部编号去 JOIN）
  // 列长风险已实测：p50 19 / p99 285 字符，全表超 17,982 字符的只有几十条，2000 行的尾巴量级可忽
  const wideIds = [...peers.values()].map((p) => p.wideId).filter((x) => Number.isFinite(x) && x > 0);
  if (wideIds.length === 0) return [];
  const [pathRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, backbone_path p FROM notice_search WHERE id IN (${wideIds.map(() => "?").join(",")})`,
    wideIds,
  );
  const wideToExt = new Map<number, string>();
  for (const [nid, p] of peers) wideToExt.set(p.wideId, nid);
  const candidateRows: NodeRow[] = (pathRows as RowDataPacket[]).flatMap((r) => {
    const nid = wideToExt.get(Number(r.id));
    if (!nid) return [];
    return fromBackbonePathColumn(r.p).map((node) => ({ notice_id: nid, node }));
  });
  if (candidateRows.length === 0) return [];

  const deadlineTs: Record<string, number> = {};
  for (const [nid, p] of peers) deadlineTs[nid] = p.deadline;

  return rankSimilarPeers(
    currentNodes.map((node) => ({ notice_id: currentNoticeId, node })),
    candidateRows,
    limit,
    deadlineTs,
  )
    .map((x) => peers.get(x.notice_id)?.wideId)
    .filter((id): id is number => id != null);
}

/** 编排：打分取 Top-N notice_pk → 复用主列表同一条尾（fetchDetailsByIds+formatItems）水合为服务表宽表项；无结果即空数组 */
export async function findSimilarNotices(
  pool: Pool, noticeDbId: number, limit: number, locale?: string,
): Promise<RowDataPacket[]> {
  const ids = await findSimilarNoticeIds(pool, noticeDbId, limit); // 有序 notice_pk
  if (ids.length === 0) return [];
  const details = await fetchDetailsByIds(pool, ids, locale || "en"); // FIELD 保留相似排序
  return formatItems(details, locale || "en") as unknown as RowDataPacket[];
}
