/**
 * 相似公告（纯品类语义相似，口径 = 品目骨架节点码）
 *
 * 流程：内部 id → 当前公告的骨架节点码集 → 按码深度分档取共享码 peer 候选（活跃、排除自身）
 *      → 节点码最长公共前缀加权打分排序 → 水合为列表项。
 * 无码 / 无候选 → 直接返回空数组，不做任何兜底。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ACTIVE_NOTICE_WHERE } from "../../utils/notice-expired";
import { normalizeNoticeType } from "../../utils/notice-type";
import { effectivePrefixOf, fromBackbonePathColumn } from "../commodity/backbone-path";
import { rankSimilarPeers, type NodeRow } from "./similar-scoring";

/** 候选上限：一条公告最多拿多少个 peer 去打分 */
const CANDIDATE_LIMIT = 2000;
/** 一次 IN 列表的码数：走 idx_notice_code_notice 等值探测，语句过长无益 */
const CODE_CHUNK = 200;
/** 一轮检索最多发的候选查询数：巨量码公告（实测最长 5,091 码）的兜底闸门 */
const MAX_CANDIDATE_QUERIES = 12;

/**
 * 把当前公告的码按有效位深度分档（细码→族级→段级），返回三档原始码列表。
 * 只决定候选检索的优先级，不改归属口径：有效位归一用的就是 backbone-path 那一份。
 * 换不出有效位的野码不进检索（它们已经在回填侧进了 misses，由门禁点名）。
 */
function codesByDepth(codes: string[]): string[][] {
  const fine: string[] = [];
  const fam: string[] = [];
  const seg: string[] = [];
  for (const raw of codes) {
    const eff = effectivePrefixOf(raw);
    if (!eff) continue;
    if (eff.length >= 6) fine.push(raw);
    else if (eff.length === 4) fam.push(raw);
    else seg.push(raw);
  }
  return [fine, fam, seg].filter((t) => t.length > 0);
}

/** 步骤 1-4：返回按相似度排序的 peer 外部 notice_id（最多 limit 个） */
export async function findSimilarNoticeIds(pool: Pool, noticeDbId: number, limit: number): Promise<string[]> {
  // 桥表按主表外部编号存码，候选检索先得把内部 id 换成外部编号
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

  // 当前公告的原始码（候选检索的输入，与回填同一张桥表同一口径）
  const [codeRows] = await pool.query<RowDataPacket[]>(
    `SELECT code FROM crm_bid_notice_unspsc_codes WHERE notice_id = ?`,
    [currentNoticeId],
  );
  const tiers = codesByDepth(codeRows.map((r) => String(r.code ?? "").trim()));
  if (tiers.length === 0) return [];

  // 候选：共享同一个原始码的公告（`code IN` 等值走 idx_notice_code_notice，见提交说明的 EXPLAIN）。
  // 取代旧的 levelN_id 五列等值：旧口径拿旧字典 id 空比，且 JOIN 只接住 cur.level 1~5，
  // 桥表实测 level 2~7 ⇒ level 6/7 的码从来没有分支能匹配（缺陷 D-6，77 条公告出不了相似）。
  // 分档取而不是一句 LIMIT 2000 兜住：实测单码出现量 >2000 的粗码有 33 个（占全部码行 26%），
  // 不分档时窗口会被码最小的那个段级粗码灌满，精细码的 peer 一个都进不来。
  const peers = new Map<string, { wideId: number; deadline: number }>();
  let queries = 0;
  for (const tier of tiers) {
    for (let i = 0; i < tier.length && peers.size < CANDIDATE_LIMIT && queries < MAX_CANDIDATE_QUERIES; i += CODE_CHUNK) {
      const chunk = tier.slice(i, i + CODE_CHUNK);
      queries++;
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT peer.notice_id AS notice_id,
                n.id AS wide_id,
                MAX(n.deadline_ts) AS deadline_ts
         FROM crm_bid_notice_unspsc_codes peer
         JOIN crm_bid_notices n ON n.notice_id = peer.notice_id AND ${ACTIVE_NOTICE_WHERE}
         WHERE peer.notice_id <> ? AND peer.code IN (${chunk.map(() => "?").join(",")})
         GROUP BY peer.notice_id, n.id
         LIMIT ${CANDIDATE_LIMIT - peers.size}`,
        [currentNoticeId, ...chunk],
      );
      // 先入者优先：档序已经保证「共享品目/类的 peer 排在共享段级的 peer 之前」
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
  const trSelect = locale ? "tr.title_tr AS title_i18n," : "";
  const treJoin = "LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  const treSelect = "tre.title_tr AS title_en,";
  const params = [...(locale ? [locale] : []), ...noticeIds];
  const [rows] = await pool.query(
    `SELECT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.agency, n.country,
       n.deadline, n.deadline_ts, n.estimated_value, ${trSelect} ${treSelect}
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
