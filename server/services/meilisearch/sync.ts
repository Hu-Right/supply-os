/**
 * Meilisearch 文档同步
 * Meilisearch document sync (full + incremental)
 *
 * @module server/services/meilisearch/sync
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { classifyAgencyType } from "../agencyI18n";
import { getClient, isHealthy, getIndexName } from "./client";
import { COUNTRY_NAME_ZH } from "../../../src/shared/data/countryNames";
import { segmentZh } from "./segmentZh";

// NULL deadline 的哨兵值：0（纪元起点）
const NULL_DEADLINE_SENTINEL = 0;

// ── 国家标准化映射（与宽表同步逻辑一致）──
const UPPER_TO_CANONICAL = new Map<string, string>();
{
  const zhGroups = new Map<string, string[]>();
  for (const [en, zh] of Object.entries(COUNTRY_NAME_ZH)) {
    if (!zhGroups.has(zh)) zhGroups.set(zh, []);
    zhGroups.get(zh)!.push(en);
  }
  for (const [, forms] of Array.from(zhGroups.entries())) {
    if (["东部和南部非洲", "西部和中部非洲", "西南印度洋", "多国", "区域"].includes(forms[0])) continue;
    const canonical = forms.find((f) => /[a-z]/.test(f)) || forms[0];
    for (const form of forms) {
      UPPER_TO_CANONICAL.set(form.toUpperCase(), canonical);
    }
    UPPER_TO_CANONICAL.set(canonical.toUpperCase(), canonical);
  }
}

function normalizeCountry(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (COUNTRY_NAME_ZH[trimmed]) return UPPER_TO_CANONICAL.get(trimmed.toUpperCase()) || trimmed;
  const canonical = UPPER_TO_CANONICAL.get(trimmed.toUpperCase());
  if (canonical) return canonical;
  return trimmed;
}

// ── 机构别名映射缓存 ──
let _aliasMapCache: Map<string, string> | null = null;
let _aliasMapExpires = 0;

async function getAliasMap(pool: Pool): Promise<Map<string, string>> {
  if (_aliasMapCache && Date.now() < _aliasMapExpires) return _aliasMapCache;
  const aliasMap = new Map<string, string>();
  try {
    const [rows] = await pool.query("SELECT canonical, alias FROM crm_agency_aliases");
    for (const row of rows as RowDataPacket[]) {
      aliasMap.set(String(row.alias || "").trim().toUpperCase(), String(row.canonical || "").trim());
    }
    _aliasMapCache = aliasMap;
    _aliasMapExpires = Date.now() + 10 * 60 * 1000; // 10 分钟缓存
  } catch {
    // 表不存在或查询失败：静默降级
  }
  return aliasMap;
}

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

// ── 支持的语言列表 ──
const SUPPORTED_LANGS = ["zh", "en", "fr", "ru", "es", "ar"];

/** 构建同步文档（从宽表行）：宽表已包含标准化字段和翻译，无需额外处理 */
function buildSyncDocFromWideTable(r: any) {
  // 构建多语言翻译字段
  // description 截断为 2000 字符以控制索引大小（关键词可能出现在较深位置）
  // 中文 zh 字段在写入前执行 jieba 分词，解决 Meilisearch 中文分词缺失问题
  const langFields: Record<string, string> = {};
  for (const lang of SUPPORTED_LANGS) {
    langFields[`title_${lang}`] = String(r[`title_${lang}`] || "");
    const rawDesc = (String(r[`description_${lang}`] || "")).slice(0, 2000);
    // 仅中文字段需要 jieba 分词预处理
    langFields[`description_${lang}`] = lang === "zh" ? segmentZh(rawDesc) : rawDesc;
  }
  // 中文标题同样需要分词（标题中的关键词需被正确切分）
  langFields["title_zh"] = segmentZh(langFields["title_zh"]);

  // UNSPSC：宽表存储为逗号分隔字符串，转为数组
  const parseUnspsc = (val: any): string[] => val ? String(val).split(",").filter(Boolean) : [];

  return {
    id: Number(r.id),
    notice_id: String(r.notice_id || ""),
    reference: String(r.reference || ""),
    title: String(r.title || ""),
    description: (String(r.description || "")).slice(0, 2000),
    // 宽表已存储标准化后的值
    country: String(r.country_std || ""),
    agency: String(r.agency_std || ""),
    agency_group: String(r.agency_group || ""),
    notice_type: String(r.notice_type_std || ""),
    notice_type_normalized: String(r.notice_type_std || ""),
    deadline_sec: r.deadline_sec ? Number(r.deadline_sec) : NULL_DEADLINE_SENTINEL,
    has_deadline: r.deadline_sec ? 1 : 0, // 排序辅助：NULL 截止日期排到最后（has_deadline:desc 优先）
    is_active: r.is_active ? 1 : 0,
    is_expired: 0, // 宽表无此字段，搜索用 deadline_sec 判断过期
    is_featured: r.is_featured ? 1 : 0,
    ...langFields,
    level1_id: parseUnspsc(r.unspsc_level1),
    level2_id: parseUnspsc(r.unspsc_level2),
    level3_id: parseUnspsc(r.unspsc_level3),
    level4_id: parseUnspsc(r.unspsc_level4),
    level5_id: parseUnspsc(r.unspsc_level5),
  };
}

/** 从宽表同步的 SQL（单表查询，零 JOIN） */
const WIDE_TABLE_SYNC_SQL = `
  SELECT id, notice_id, reference, title, description,
         country_std, agency_std, agency_group, notice_type_std,
         deadline_sec, is_active, is_featured,
         unspsc_level1, unspsc_level2, unspsc_level3, unspsc_level4, unspsc_level5,
         title_zh, description_zh, title_en, description_en,
         title_fr, description_fr, title_ru, description_ru,
         title_es, description_es, title_ar, description_ar
  FROM crm_notice_search
`;

/**
 * 全量同步：先清空索引，再从宽表拉取全量数据写入
 */
export async function fullSync(pool: Pool): Promise<{ synced: number; elapsed: number; lastId: number }> {
  const client = getClient();
  if (!client || !isHealthy()) return { synced: 0, elapsed: 0, lastId: 0 };
  const INDEX_NAME = getIndexName();
  const start = Date.now();

  try {
    await client.index(INDEX_NAME).deleteAllDocuments();
    console.log("[meilisearch] fullSync: 已清空旧索引，从宽表重建索引...");

    const BATCH = 2000;
    const MEILI_BATCH = 200; // Meilisearch 分批写入大小，避免单次 HTTP 请求体过大
    let lastId = 0;
    let totalSynced = 0;

    while (true) {
      const [rows] = await pool.query(
        WIDE_TABLE_SYNC_SQL + " WHERE id > ? ORDER BY id ASC LIMIT ?",
        [lastId, BATCH]
      );

      const docs = (rows as any[]).map((r) => buildSyncDocFromWideTable(r));
      if (docs.length === 0) break;

      // addDocumentsInBatches 返回 Promise 数组，需 Promise.all 正确等待全部完成
      await Promise.all(client.index(INDEX_NAME).addDocumentsInBatches(docs, MEILI_BATCH, { primaryKey: "id" }));
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
 * 增量同步：从宽表同步 id > watermark 的新增记录
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
      WIDE_TABLE_SYNC_SQL + " WHERE id > ? ORDER BY id ASC LIMIT 5000",
      [watermark]
    );

    let updatedRaw: any[] = [];
    try {
      const [updatedRows] = await pool.query(
        WIDE_TABLE_SYNC_SQL +
        " WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) ORDER BY id ASC LIMIT 2000",
        []
      );
      updatedRaw = updatedRows as any[];
    } catch {
      // updated_at 列可能不存在
    }

    // 合并去重
    const rawMap = new Map<number, any>();
    for (const r of newRows as any[]) rawMap.set(r.id, r);
    for (const r of updatedRaw) rawMap.set(r.id, r);

    const allRaw = Array.from(rawMap.values()).sort((a, b) => a.id - b.id);
    if (allRaw.length === 0) return { synced: 0, newWatermark: watermark };

    const docs = allRaw.map((r) => buildSyncDocFromWideTable(r));
    await Promise.all(client.index(INDEX_NAME).addDocumentsInBatches(docs, 500, { primaryKey: "id" }));
    const newWatermark = allRaw[allRaw.length - 1].id;
    return { synced: docs.length, newWatermark };
  } catch (err) {
    console.error("[meilisearch] incrementalSync failed:", (err as Error).message);
    return { synced: 0, newWatermark: watermark };
  }
}

/**
 * 按 ID 重新同步指定公告到 Meilisearch（从宽表）
 * 内部分批处理，支持大批量 ID（如 is_active 刷新产生的数万条变更）
 */
export async function syncNoticeIds(pool: Pool, ids: number[]): Promise<{ synced: number }> {
  const client = getClient();
  if (!client || !isHealthy() || ids.length === 0) return { synced: 0 };
  const INDEX_NAME = getIndexName();

  try {
    const SQL_BATCH_SIZE = 1000; // MySQL IN(...) 查询分批，避免占位符过多
    let totalSynced = 0;

    for (let i = 0; i < ids.length; i += SQL_BATCH_SIZE) {
      const batch = ids.slice(i, i + SQL_BATCH_SIZE);
      const placeholders = batch.map(() => "?").join(",");
      const [rows] = await pool.query(
        WIDE_TABLE_SYNC_SQL + ` WHERE id IN (${placeholders}) ORDER BY id ASC`,
        batch
      );

      const docs = (rows as any[]).map((r) => buildSyncDocFromWideTable(r));
      if (docs.length > 0) {
        await Promise.all(client.index(INDEX_NAME).addDocumentsInBatches(docs, 500, { primaryKey: "id" }));
        totalSynced += docs.length;
      }
    }

    return { synced: totalSynced };
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
