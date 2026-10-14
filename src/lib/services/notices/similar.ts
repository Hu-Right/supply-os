/**
 * 相似公告（纯品类语义相似，口径 = 品目骨架节点码）
 *
 * 流程：内部 id → 当前公告的骨架节点码集 → 按码深度分档取共享码 peer 候选（活跃、排除自身）
 *      → 节点码最长公共前缀加权打分排序 → 水合为列表项。
 * 无码 / 无候选 → 直接返回空数组，不做任何兜底。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ACTIVE_NOTICE_WHERE } from "../../utils/notice-expired";
import { columns } from "../../utils/sql-columns";
import { normalizeNoticeType } from "../../utils/notice-type";
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
 * 小表剥离后候选检索改走倒排表 UGT 节点（不再读桥表的 UNSPSC 原始码），
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

/** 步骤 1-4：返回按相似度排序的 peer 外部 notice_id（最多 limit 个） */
export async function findSimilarNoticeIds(pool: Pool, noticeDbId: number, limit: number): Promise<string[]> {
  // 候选水合与打分侧都要外部编号，先换出来
  const [idRows] = await pool.query<RowDataPacket[]>(
    "SELECT notice_id FROM crm_bid_notices n WHERE n.id = ? LIMIT 1",
    [noticeDbId],
  );
  const currentNoticeId = idRows[0]?.notice_id as string | undefined;
  if (!currentNoticeId) return [];

  // 当前公告的节点码：宽表派生列按主键点查（与筛选谓词同一列，不存在第二份口径）
  const [curWide] = await pool.query<RowDataPacket[]>(
    `SELECT backbone_path p FROM crm_notice_search WHERE id = ? LIMIT 1`,
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
  // 小表剥离：不再经桥表 UNSPSC 原始码中转（那批码本身大量失真），直接按节点码找 peer，
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
         JOIN crm_bid_notices n ON n.id = peer.notice_id AND ${ACTIVE_NOTICE_WHERE}
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
    `SELECT id, backbone_path p FROM crm_notice_search WHERE id IN (${wideIds.map(() => "?").join(",")})`,
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
  ).map((x) => x.notice_id);
}

/** 步骤 5：把 notice_id 集合水合为列表项 */
async function hydrateListItems(pool: Pool, noticeIds: string[], locale?: string): Promise<RowDataPacket[]> {
  if (noticeIds.length === 0) return [];
  const ph = noticeIds.map(() => "?").join(",");
  const trJoin = locale ? "LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?" : "";
  const treJoin = "LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  // 列清单交给 columns() 拼：分隔符只有一个出处，条件列不启用就传 falsy。
  // 以前这里用两个各自带尾逗号的片段拼在 FROM 前，不传 locale 时也会多出个尾逗号，
  // MySQL 直接 1064 —— 相似公告上线三周每次都返回 500，单测因为 mock 了 pool.query 全绿。
  const selectList = columns(
    "n.id, n.notice_id, n.reference, n.title, n.notice_type, n.agency, n.country",
    "n.deadline, n.deadline_ts, n.estimated_value",
    locale && "tr.title_tr AS title_i18n",
    "tre.title_tr AS title_en",
  );
  const params = [...(locale ? [locale] : []), ...noticeIds];
  const [rows] = await pool.query(
    `SELECT ${selectList}
     FROM crm_bid_notices n
     ${trJoin} ${treJoin}
     WHERE n.notice_id IN (${ph}) AND ${ACTIVE_NOTICE_WHERE}`,
    params,
  );
  return rows as RowDataPacket[];
}

/** 编排：打分取 Top-N notice_id → 水合 → 按相似度顺序返回；无结果即空数组 */
export async function findSimilarNotices(
  pool: Pool, noticeDbId: number, limit: number, locale?: string,
): Promise<RowDataPacket[]> {
  const ids = await findSimilarNoticeIds(pool, noticeDbId, limit);
  if (ids.length === 0) return [];
  const rows = await hydrateListItems(pool, ids, locale);
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows
    .slice()
    .sort((a, b) => (order.get(String(a.notice_id)) ?? 1e9) - (order.get(String(b.notice_id)) ?? 1e9))
    .map((r) => ({ ...r, notice_type: normalizeNoticeType(r.notice_type as string) }));
}
