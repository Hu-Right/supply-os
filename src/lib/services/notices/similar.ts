/**
 * 相似公告（纯品类语义相似，口径 = 品目骨架节点码）
 *
 * 流程：内部 id → 当前公告的骨架节点码集 → 共享原始码的 peer 候选（活跃、排除自身）
 *      → 节点码最长公共前缀加权打分排序 → 水合为列表项。
 * 无码 / 无候选 → 直接返回空数组，不做任何兜底。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ACTIVE_NOTICE_WHERE } from "../../utils/notice-expired";
import { normalizeNoticeType } from "../../utils/notice-type";
import { fromBackbonePathColumn } from "../commodity/backbone-path";
import { rankSimilarPeers, type NodeRow } from "./similar-scoring";

/** 候选上限：与旧口径同一个数（2000 行 peer），换检索方式不改召回窗口 */
const CANDIDATE_LIMIT = 2000;

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
  const currentNodes = fromBackbonePathColumn(curWide[0]?.p);
  if (currentNodes.length === 0) return []; // 无码（含平台 RFQ）→ 空，不兜底

  // 候选：与本公告共享至少一个原始码的公告（等值走桥表 idx_code，2026-10-11 加）。
  // 取代旧的 levelN_id 五列等值：旧口径拿旧字典 id 空比，且 JOIN 只接住 cur.level 1~5，
  // 桥表实测 level 2~7 ⇒ level 6/7 的码从来没有分支能匹配（缺陷 D-6，77 条公告出不了相似）。
  // 共享一个码 ≡ 旧口径的「同一字典节点」，语义等价而不限层级。
  const [candRows] = await pool.query<RowDataPacket[]>(
    `SELECT peer.notice_id AS notice_id,
            n.id AS wide_id,
            MAX(n.deadline_ts) AS deadline_ts
     FROM crm_bid_notice_unspsc_codes cur
     JOIN crm_bid_notice_unspsc_codes peer
       ON peer.code = cur.code AND peer.notice_id <> cur.notice_id
     JOIN crm_bid_notices n ON n.notice_id = peer.notice_id AND ${ACTIVE_NOTICE_WHERE}
     WHERE cur.notice_id = ?
     GROUP BY peer.notice_id, n.id
     LIMIT ${CANDIDATE_LIMIT}`,
    [currentNoticeId],
  );
  if (candRows.length === 0) return [];

  // 候选的节点码：宽表拿主键批量点查（宽表没得 notice_id 索引，别拿外部编号去 JOIN）
  // 列长风险已实测：p50 19 / p99 285 字符，全表超 17,982 字符的只有几十条，2000 行的尾巴量级可忽
  const extByWide = new Map<number, string>();
  for (const r of candRows) {
    const wid = Number(r.wide_id);
    if (Number.isFinite(wid) && wid > 0) extByWide.set(wid, String(r.notice_id));
  }
  const wideIds = [...extByWide.keys()];
  if (wideIds.length === 0) return [];
  const [pathRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, backbone_path p FROM crm_notice_search WHERE id IN (${wideIds.map(() => "?").join(",")})`,
    wideIds,
  );
  const candidateRows: NodeRow[] = (pathRows as RowDataPacket[]).flatMap((r) => {
    const nid = extByWide.get(Number(r.id));
    if (!nid) return [];
    return fromBackbonePathColumn(r.p).map((node) => ({ notice_id: nid, node }));
  });
  if (candidateRows.length === 0) return [];

  const deadlineTs: Record<string, number> = {};
  for (const r of candRows) if (r.notice_id) deadlineTs[String(r.notice_id)] = Number(r.deadline_ts || 0);

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
