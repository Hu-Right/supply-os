/**
 * 相似公告（纯 UNSPSC 品类语义相似）
 *
 * 流程：外部编号 → 当前公告桥接码 → 共享类目 peer 候选（活跃、排除自身）
 *      → 最深命中层级加权打分排序 → 水合为列表项。
 * 无码 / 无候选 → 直接返回空数组，不做任何兜底。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ACTIVE_NOTICE_WHERE } from "../../utils/notice-expired";
import { normalizeNoticeType } from "../../utils/notice-type";
import { rankSimilarPeers, type BridgeRow } from "./similar-scoring";

/** 步骤 1-4：返回按相似度排序的 peer 外部 notice_id（最多 limit 个） */
export async function findSimilarNoticeIds(pool: Pool, noticeDbId: number, limit: number): Promise<string[]> {
  const [idRows] = await pool.query(
    "SELECT notice_id FROM crm_bid_notices n WHERE n.id = ? LIMIT 1",
    [noticeDbId],
  );
  const currentNoticeId = (idRows as RowDataPacket[])[0]?.notice_id as string | undefined;
  if (!currentNoticeId) return [];

  const [curRows] = await pool.query(
    `SELECT level1_id, level2_id, level3_id, level4_id, level5_id
     FROM crm_bid_notice_unspsc_codes WHERE notice_id = ?`,
    [currentNoticeId],
  );
  const currentRows = curRows as BridgeRow[];
  if (currentRows.length === 0) return []; // 无码（含平台 RFQ）→ 空，不兜底

  const [peerRows] = await pool.query(
    `SELECT peer.notice_id AS notice_id,
            peer.level1_id AS level1_id, peer.level2_id AS level2_id, peer.level3_id AS level3_id,
            peer.level4_id AS level4_id, peer.level5_id AS level5_id,
            n.deadline_ts AS deadline_ts
     FROM crm_bid_notice_unspsc_codes cur
     JOIN crm_bid_notice_unspsc_codes peer
       ON peer.notice_id <> cur.notice_id
      AND ( (cur.level1_id IS NOT NULL AND cur.level1_id <> '' AND peer.level1_id = cur.level1_id)
         OR (cur.level2_id IS NOT NULL AND cur.level2_id <> '' AND peer.level2_id = cur.level2_id)
         OR (cur.level3_id IS NOT NULL AND cur.level3_id <> '' AND peer.level3_id = cur.level3_id)
         OR (cur.level4_id IS NOT NULL AND cur.level4_id <> '' AND peer.level4_id = cur.level4_id)
         OR (cur.level5_id IS NOT NULL AND cur.level5_id <> '' AND peer.level5_id = cur.level5_id) )
     JOIN crm_bid_notices n ON n.notice_id = peer.notice_id
     WHERE cur.notice_id = ? AND ${ACTIVE_NOTICE_WHERE}
     LIMIT 2000`,
    [currentNoticeId],
  );
  const peers = peerRows as (BridgeRow & { deadline_ts?: number })[];
  if (peers.length === 0) return [];

  const deadlineTs: Record<string, number> = {};
  for (const p of peers) if (p.notice_id) deadlineTs[p.notice_id] = Number(p.deadline_ts || 0);

  return rankSimilarPeers(currentRows, peers, limit, deadlineTs).map((r) => r.notice_id);
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
