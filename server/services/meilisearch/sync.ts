/**
 * Meilisearch 文档同步
 * Meilisearch document sync (full + incremental)
 *
 * @module server/services/meilisearch/sync
 */
import type { Pool } from "mysql2/promise";
import { classifyAgencyType } from "../agencyI18n";
import { getClient, isHealthy, getIndexName } from "./client";

// NULL deadline 的哨兵值：0（纪元起点）
const NULL_DEADLINE_SENTINEL = 0;

/**
 * notice_type 归一化：将混合存储的原始值映射为标准短代码
 */
export function normalizeNoticeType(raw: string | null | undefined): string {
  if (!raw) return "OTHER";
  const upper = raw.toUpperCase().trim();

  const SHORT_CODES: Record<string, string> = {
    ITB: "ITB", ITT: "ITB",
    RFQ: "RFQ", RFP: "RFP",
    EOI: "EOI", PQ: "PQ", PRE: "PQ",
    IC: "IC", RFI: "RFI", GPN: "GPN",
  };
  if (SHORT_CODES[upper]) return SHORT_CODES[upper];

  if (/expression of interest|意向表达|意向征集|\beoi\b/i.test(raw)) return "EOI";
  if (/quotation|报价|询价/i.test(raw)) return "RFQ";
  if (/\brfp\b|proposal|提案|建议书/i.test(raw)) return "RFP";
  if (/pre[\s-]?qualif|资格预审/i.test(raw)) return "PQ";
  if (/consultant|顾问/i.test(raw)) return "IC";
  if (/request for information|信息征询|\brfi\b/i.test(raw)) return "RFI";
  if (/general procurement notice|\bgpn\b/i.test(raw)) return "GPN";
  if (/contract award|award notice|授标|中标/i.test(raw)) return "AWARD";
  if (/\btenders?\b|\bbids?\b|\bitb\b|\bitt\b|招标|投标/i.test(raw)) return "ITB";

  return "OTHER";
}

/** 构建同步文档：从 MySQL 行映射为 Meilisearch 文档 */
function buildSyncDoc(r: any) {
  let agencyGroup: string | undefined;
  if (r.agency && r.country) {
    const typeInfo = classifyAgencyType(r.agency, r.country);
    if (typeInfo) {
      agencyGroup = typeInfo.typeKey;
    }
  }
  return {
    id: r.id,
    notice_id: r.notice_id,
    reference: r.reference || "",
    title: r.title || "",
    description: r.description || "",
    country: r.country || "",
    agency: r.agency || "",
    agency_group: agencyGroup || "",
    notice_type: r.notice_type || "",
    notice_type_normalized: normalizeNoticeType(r.notice_type),
    deadline_sec: r.deadline_sec ? Number(r.deadline_sec) : NULL_DEADLINE_SENTINEL,
    is_active: r.is_active ? 1 : 0,
    is_expired: r.is_expired ? 1 : 0,
    is_featured: r.is_featured ? 1 : 0,
    title_zh: r.title_zh || "",
    description_zh: r.description_zh || "",
    title_en: r.title_en || "",
    description_en: r.description_en || "",
    level1_id: r.level1_ids ? String(r.level1_ids).split(",").filter(Boolean) : [],
    level2_id: r.level2_ids ? String(r.level2_ids).split(",").filter(Boolean) : [],
    level3_id: r.level3_ids ? String(r.level3_ids).split(",").filter(Boolean) : [],
    level4_id: r.level4_ids ? String(r.level4_ids).split(",").filter(Boolean) : [],
    level5_id: r.level5_ids ? String(r.level5_ids).split(",").filter(Boolean) : [],
  };
}

/** 同步 SQL */
const SYNC_SQL_SELECT = `
  SELECT n.id, n.notice_id, n.reference, n.title,
         LEFT(n.description, 2000) AS description,
         n.country, n.agency, n.notice_type, n.deadline_sec,
         n.is_active, n.is_expired, n.is_featured,
         tzh.title_tr AS title_zh, tzh.description_tr AS description_zh,
         ten.title_tr AS title_en, ten.description_tr AS description_en,
         _u.level1_ids, _u.level2_ids, _u.level3_ids, _u.level4_ids, _u.level5_ids
`;
const SYNC_SQL_JOIN = `
  FROM crm_bid_notices n
  LEFT JOIN crm_notice_translations tzh ON tzh.notice_id = n.id AND tzh.lang = 'zh'
  LEFT JOIN crm_notice_translations ten ON ten.notice_id = n.id AND ten.lang = 'en'
  LEFT JOIN (
    SELECT notice_id,
           GROUP_CONCAT(DISTINCT level1_id) AS level1_ids,
           GROUP_CONCAT(DISTINCT level2_id) AS level2_ids,
           GROUP_CONCAT(DISTINCT level3_id) AS level3_ids,
           GROUP_CONCAT(DISTINCT level4_id) AS level4_ids,
           GROUP_CONCAT(DISTINCT level5_id) AS level5_ids
    FROM crm_bid_notice_unspsc_codes
    GROUP BY notice_id
  ) _u ON _u.notice_id = n.notice_id
`;

/**
 * 全量同步：先清空索引，再从 MySQL 拉取全量公告数据写入
 */
export async function fullSync(pool: Pool): Promise<{ synced: number; elapsed: number; lastId: number }> {
  const client = getClient();
  if (!client || !isHealthy()) return { synced: 0, elapsed: 0, lastId: 0 };
  const INDEX_NAME = getIndexName();
  const start = Date.now();

  try {
    await client.index(INDEX_NAME).deleteAllDocuments();
    console.log("[meilisearch] fullSync: 已清空旧索引，开始重建...");

    const BATCH = 2000;
    let lastId = 0;
    let totalSynced = 0;

    while (true) {
      const [rows] = await pool.query(
        SYNC_SQL_SELECT + SYNC_SQL_JOIN + " WHERE n.id > ? ORDER BY n.id ASC LIMIT ?",
        [lastId, BATCH]
      );

      const docs = (rows as any[]).map(buildSyncDoc);
      if (docs.length === 0) break;

      await client.index(INDEX_NAME).addDocuments(docs, { primaryKey: "id" });
      totalSynced += docs.length;
      lastId = docs[docs.length - 1].id;

      if (docs.length < BATCH) break;
    }

    const elapsed = Date.now() - start;
    console.log(`[meilisearch] fullSync 完成: ${totalSynced} 条文档, ${elapsed}ms`);
    return { synced: totalSynced, elapsed, lastId };
  } catch (err) {
    console.error("[meilisearch] fullSync failed:", (err as Error).message);
    return { synced: 0, elapsed: Date.now() - start, lastId: 0 };
  }
}

/**
 * 增量同步：同步 id > watermark 的新增记录 + 最近 10 分钟内更新的记录
 */
export async function incrementalSync(
  pool: Pool,
  watermark: number
): Promise<{ synced: number; newWatermark: number }> {
  const client = getClient();
  if (!client || !isHealthy()) return { synced: 0, newWatermark: watermark };
  const INDEX_NAME = getIndexName();

  try {
    const [newRows] = await pool.query(
      SYNC_SQL_SELECT + SYNC_SQL_JOIN + " WHERE n.id > ? ORDER BY n.id ASC LIMIT 5000",
      [watermark]
    );

    let updatedDocs: any[] = [];
    try {
      const [updatedRows] = await pool.query(
        SYNC_SQL_SELECT + SYNC_SQL_JOIN +
        " WHERE n.updated_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) ORDER BY n.id ASC LIMIT 2000",
        []
      );
      updatedDocs = (updatedRows as any[]).map(buildSyncDoc);
    } catch {
      // updated_at 列可能不存在
    }

    const newDocs = (newRows as any[]).map(buildSyncDoc);
    const docMap = new Map<number, any>();
    for (const doc of newDocs) docMap.set(doc.id, doc);
    for (const doc of updatedDocs) docMap.set(doc.id, doc);

    const allDocs = Array.from(docMap.values()).sort((a, b) => a.id - b.id);
    if (allDocs.length === 0) return { synced: 0, newWatermark: watermark };

    await client.index(INDEX_NAME).addDocuments(allDocs, { primaryKey: "id" });
    const newWatermark = allDocs[allDocs.length - 1].id;
    return { synced: allDocs.length, newWatermark };
  } catch (err) {
    console.error("[meilisearch] incrementalSync failed:", (err as Error).message);
    return { synced: 0, newWatermark: watermark };
  }
}

/**
 * 按 ID 重新同步指定公告到 Meilisearch
 */
export async function syncNoticeIds(pool: Pool, ids: number[]): Promise<{ synced: number }> {
  const client = getClient();
  if (!client || !isHealthy() || ids.length === 0) return { synced: 0 };
  const INDEX_NAME = getIndexName();

  try {
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await pool.query(
      SYNC_SQL_SELECT + SYNC_SQL_JOIN +
      ` WHERE n.id IN (${placeholders}) ORDER BY n.id ASC`,
      ids
    );
    const docs = (rows as any[]).map(buildSyncDoc);
    if (docs.length === 0) return { synced: 0 };
    await client.index(INDEX_NAME).addDocuments(docs, { primaryKey: "id" });
    return { synced: docs.length };
  } catch (err) {
    console.warn("[meilisearch] syncNoticeIds failed:", (err as Error).message);
    return { synced: 0 };
  }
}

/** 获取 MySQL 中公告总数 */
export async function getMysqlActiveCount(pool: Pool): Promise<number> {
  try {
    const [rows] = await pool.query("SELECT COUNT(*) AS cnt FROM crm_bid_notices");
    return Number((rows as any[])[0]?.cnt || 0);
  } catch {
    return 0;
  }
}
