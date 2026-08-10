/**
 * Meilisearch 搜索引擎客户端
 * Meilisearch search engine client singleton
 *
 * @module server/services/meilisearch
 * @description 封装 Meilisearch SDK，提供索引管理、文档同步与健康检查。
 *              搜索场景：Meilisearch 负责筛选/排序/分页 → 返回 ID 列表 → MySQL 按 ID 取详情。
 *              降级策略：Meilisearch 不可用时，调用方回退到 MySQL FULLTEXT 查询。
 */
import { Meilisearch } from "meilisearch";
import type { Pool } from "mysql2/promise";
import { classifyAgencyType } from "./agencyI18n";

const INDEX_NAME = "notices";
const MAX_TOTAL_HITS = Number(process.env.MEILI_MAX_TOTAL_HITS || "10000000");
// NULL deadline 的哨兵值：0（纪元起点），确保无截止日期数据在降序排列中排在最后
// ASC 时 0 排最前（无截止日期最先展示）；DESC 时 0 排最后（符合「截止最远优先」语义）
const NULL_DEADLINE_SENTINEL = 0;

let client: Meilisearch | null = null;
let healthy = false;

/** 初始化 Meilisearch 客户端（幂等） */
export function initMeilisearch(): Meilisearch | null {
  const host = process.env.MEILI_HOST || "http://127.0.0.1:7700";
  const key = process.env.MEILI_MASTER_KEY || "";
  try {
    client = new Meilisearch({ host, apiKey: key || undefined, timeout: 5000 });
    return client;
  } catch (err) {
    console.warn("[meilisearch] init failed:", (err as Error).message);
    client = null;
    return null;
  }
}

export function getClient(): Meilisearch | null {
  return client;
}

export function isHealthy(): boolean {
  return healthy;
}

/** 启动时健康检查 + 索引初始化 */
export async function ensureIndex(): Promise<boolean> {
  if (!client) return false;
  try {
    const health = await client.health();
    healthy = health.status === "available";
  } catch {
    healthy = false;
    console.warn("[meilisearch] health check failed — search will fallback to MySQL LIKE");
    return false;
  }
  if (!healthy) return false;

  try {
    // 创建或更新索引配置
    const index = client.index(INDEX_NAME);
    await index.updateSettings({
      searchableAttributes: [
        "reference",
        "title",
        "title_zh",
        "title_en",
        "description",
        "description_zh",
        "description_en",
      ],
      filterableAttributes: [
        "country",
        "agency",
        // PERF 优化：聚合组标识，用于筛选时替代数百个 OR 条件
        "agency_group",
        "notice_type_normalized",
        "deadline_sec",
        "is_active",
        "is_featured",
        "level1_id",
        "level2_id",
        "level3_id",
        "level4_id",
        "level5_id",
      ],
      sortableAttributes: ["deadline_sec", "id"],
      rankingRules: [
        "words",
        "typo",
        "proximity",
        "attribute",
        "sort",
        "exactness",
      ],
      pagination: {
        maxTotalHits: MAX_TOTAL_HITS,
      },
      // ngram 分词对中文的支持：Meilisearch 内置中文分词（charabia）
      nonSeparatorTokens: ["zh"],
    });
    return true;
  } catch (err) {
    console.warn("[meilisearch] ensureIndex failed:", (err as Error).message);
    return false;
  }
}

/**
 * notice_type 归一化：将混合存储的原始值映射为标准短代码
 * 基于 src/features/procurement/notice-type.ts 的映射规则
 */
export function normalizeNoticeType(raw: string | null | undefined): string {
  if (!raw) return "OTHER";
  const upper = raw.toUpperCase().trim();

  // 短代码精确匹配
  const SHORT_CODES: Record<string, string> = {
    ITB: "ITB", ITT: "ITB",
    RFQ: "RFQ", RFP: "RFP",
    EOI: "EOI", PQ: "PQ", PRE: "PQ",
    IC: "IC", RFI: "RFI", GPN: "GPN",
  };
  if (SHORT_CODES[upper]) return SHORT_CODES[upper];

  // 长文本模式匹配（按优先级排列）
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
  // PERF 优化：计算 agency_group，用于筛选时替代数百个 OR 条件
  // 例如："Prefeitura de São Paulo" + "Brazil" → "BR_municipality"
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
    // PERF 优化：聚合组标识，用于 Meilisearch 筛选时替代数百个 OR 条件
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
    // UNSPSC 行业分类：逗号分隔字符串 → 数组（Meilisearch 多值筛选）
    level1_id: r.level1_ids ? String(r.level1_ids).split(",").filter(Boolean) : [],
    level2_id: r.level2_ids ? String(r.level2_ids).split(",").filter(Boolean) : [],
    level3_id: r.level3_ids ? String(r.level3_ids).split(",").filter(Boolean) : [],
    level4_id: r.level4_ids ? String(r.level4_ids).split(",").filter(Boolean) : [],
    level5_id: r.level5_ids ? String(r.level5_ids).split(",").filter(Boolean) : [],
  };
}

/** 同步 SQL：包含 agency、is_active 字段 + UNSPSC 行业分类 */
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
 * 获取 Meilisearch 索引中已同步的最大文档 ID
 * 用于启动时恢复 watermark，避免重复全量同步
 */
export async function getLastSyncedId(): Promise<number> {
  if (!client || !healthy) return 0;
  try {
    const result = await client.index(INDEX_NAME).search("", {
      sort: ["id:desc"],
      limit: 1,
      attributesToRetrieve: ["id"],
    });
    if (result.hits.length > 0) return Number(result.hits[0].id) || 0;
    return 0;
  } catch {
    return 0;
  }
}

/**
 * 获取 Meilisearch 索引中的文档总数
 */
export async function getDocCount(): Promise<number> {
  if (!client || !healthy) return 0;
  try {
    const stats = await client.index(INDEX_NAME).getStats();
    return stats.numberOfDocuments || 0;
  } catch {
    return 0;
  }
}

/**
 * 全量同步：先清空索引，再从 MySQL 拉取全量公告数据写入
 * 首次启动或手动触发时调用。清空索引可消除 ghost IDs（MySQL 已删除但索引中仍存在的文档）
 * P2-1 修复：使用 keyset 分页替代 OFFSET，避免大数据集性能退化
 */
export async function fullSync(pool: Pool): Promise<{ synced: number; elapsed: number; lastId: number }> {
  if (!client || !healthy) return { synced: 0, elapsed: 0, lastId: 0 };
  const start = Date.now();

  try {
    // 先清空索引，消除 ghost IDs
    await client.index(INDEX_NAME).deleteAllDocuments();
    console.log("[meilisearch] fullSync: 已清空旧索引，开始重建...");

    const BATCH = 2000;
    let lastId = 0;
    let totalSynced = 0;

    while (true) {
      // P2-1: keyset 分页——WHERE id > lastId 替代表 OFFSET，始终走主键索引
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
 * 定时调用（每 1 分钟）
 * P1-3 修复：原实现仅基于 ID 递增，无法捕获翻译/状态等字段更新。
 *           现增加时间窗口回扫，确保近期修改的记录同步到索引。
 */
export async function incrementalSync(
  pool: Pool,
  watermark: number
): Promise<{ synced: number; newWatermark: number }> {
  if (!client || !healthy) return { synced: 0, newWatermark: watermark };

  try {
    // 查询 1: 新增记录（ID > watermark）
    const [newRows] = await pool.query(
      SYNC_SQL_SELECT + SYNC_SQL_JOIN + " WHERE n.id > ? ORDER BY n.id ASC LIMIT 5000",
      [watermark]
    );

    // P1-3: 查询 2——最近 10 分钟内更新的记录（捕获翻译/状态等字段变更）
    let updatedDocs: any[] = [];
    try {
      const [updatedRows] = await pool.query(
        SYNC_SQL_SELECT + SYNC_SQL_JOIN +
        " WHERE n.updated_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) ORDER BY n.id ASC LIMIT 2000",
        []
      );
      updatedDocs = (updatedRows as any[]).map(buildSyncDoc);
    } catch {
      // updated_at 列可能不存在（外部 CRM 表），静默跳过
    }

    const newDocs = (newRows as any[]).map(buildSyncDoc);
    // 合并去重（以 id 为 key，updatedDocs 覆盖 newDocs 中的同名记录）
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
 * 条件搜索：通过 Meilisearch 执行多条件筛选 + 排序 + 分页，返回 ID 列表 + 总数
 * 支持：关键词 + 国家 + 机构 + 日期范围 + 公告类型 + 精选 + 排序 + 分页
 * 自动过滤过时数据（is_active = 1）
 * 返回 null 表示搜索失败（调用方降级到 MySQL）
 */
export async function searchWithFilters(params: {
  q?: string;
  country?: string;
  /** 已解析的数据库原始机构名列表（调用方负责 canonical → originals 转换） */
  agencies?: string[];
  /** PERF 优化：聚合组标识（如 "BR_municipality"），用于替代数百个 OR 条件 */
  agencyGroup?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  deadlineWithinDays?: number;
  noticeType?: string;
  featuredOnly?: boolean;
  /** UNSPSC 行业筛选：层级 (1-5) */
  unspscLevel?: number;
  /** UNSPSC 行业筛选：crm_unspsc_codes.id（字符串） */
  unspscLevelId?: string;
  sort?: string;
  page: number;
  pageSize: number;
}): Promise<{ ids: number[]; total: number } | null> {
  if (!client || !healthy) return null;

  try {
    const {
      q, country, agencies, agencyGroup, deadlineFrom, deadlineTo,
      deadlineWithinDays, noticeType, featuredOnly,
      unspscLevel, unspscLevelId,
      sort, page, pageSize,
    } = params;

    // 构建 filter 数组（AND 组合）
    const filter: string[] = ["is_active = 1"];
    // BUG-S1 修复：转义 filter 值中的双引号，防止 Meilisearch filter 注入
    if (country) filter.push(`country = "${escapeFilter(country)}"`);
    // PERF 优化：优先使用 agencyGroup 替代数百个 OR 条件
    // 例如："巴西各市政府" → agency_group = "BR_municipality"（1 个等值筛选）
    // 而非 agency = "Prefeitura de A" OR agency = "Prefeitura de B" OR ...（数百个 OR）
    if (agencyGroup) {
      filter.push(`agency_group = "${escapeFilter(agencyGroup)}"`);
    } else if (agencies && agencies.length > 0) {
      if (agencies.length === 1) {
        filter.push(`agency = "${escapeFilter(agencies[0])}"`);
      } else {
        const orParts = agencies.map((o) => `agency = "${escapeFilter(o)}"`).join(" OR ");
        filter.push(`(${orParts})`);
      }
    }
    // BUG-SRC-2 修复：日期字符串按北京时间（UTC+8）解析，与 MySQL UNIX_TIMESTAMP() 语义一致
    if (deadlineFrom && /^\d{4}-\d{2}-\d{2}$/.test(deadlineFrom)) {
      const ts = toBeijingUnixTs(deadlineFrom, "00:00:00");
      filter.push(`deadline_sec >= ${ts}`);
    }
    if (deadlineTo && /^\d{4}-\d{2}-\d{2}$/.test(deadlineTo)) {
      const ts = toBeijingUnixTs(deadlineTo, "23:59:59");
      filter.push(`deadline_sec <= ${ts}`);
    }
    if (deadlineWithinDays && deadlineWithinDays > 0) {
      const futureTs = Math.floor(Date.now() / 1000) + deadlineWithinDays * 86400;
      filter.push(`deadline_sec <= ${futureTs}`);
    }
    if (noticeType) {
      const normalized = normalizeNoticeType(noticeType);
      filter.push(`notice_type_normalized = "${escapeFilter(normalized)}"`);
    }
    if (featuredOnly) filter.push("is_featured = 1");
    // UNSPSC 行业分类筛选（数组字段：任一元素匹配即可）
    if (unspscLevel && unspscLevel >= 1 && unspscLevel <= 5 && unspscLevelId) {
      filter.push(`level${unspscLevel}_id = "${escapeFilter(unspscLevelId)}"`);
    }

    // 排序映射
    const sortArr: string[] = [];
    if (sort === "latest") {
      sortArr.push("id:desc");
    } else if (sort === "deadline") {
      sortArr.push("deadline_sec:asc", "id:desc");
      // 注：不再过滤无截止日期的记录（deadline_sec=0 哨兵值）
      // MySQL 路径会在最终排序时将 NULL/0 值排在最后
    } else {
      // deadline_farthest（默认）
      sortArr.push("deadline_sec:desc", "id:desc");
    }

    const offset = (page - 1) * pageSize;
    // PERF 优化：搜索超时控制——3 秒无响应返回 null 降级到 MySQL
    // 防止 Meilisearch 引擎卡住时阻塞整个搜索请求
    const SEARCH_TIMEOUT_MS = 3000;
    const searchPromise = client.index(INDEX_NAME).search(q || "", {
      filter,
      sort: sortArr,
      limit: pageSize,
      offset,
      attributesToRetrieve: ["id"],
    });
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error(`Meilisearch search timeout after ${SEARCH_TIMEOUT_MS}ms`)), SEARCH_TIMEOUT_MS)
    );
    const result = await Promise.race([searchPromise, timeoutPromise]) as any;
    if (result === null) return null;

    const ids = result.hits.map((h: any) => Number(h.id)).filter(Boolean);
    return { ids, total: result.estimatedTotalHits ?? ids.length };
  } catch (err) {
    console.warn("[meilisearch] searchWithFilters failed:", (err as Error).message);
    return null;
  }
}

/** 转义 Meilisearch filter 字符串中的双引号和反斜杠 */
function escapeFilter(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * BUG-SRC-2 修复：将日期字符串按北京时间（UTC+8）解析为 Unix 时间戳
 * 与 MySQL UNIX_TIMESTAMP() 在中国服务器（UTC+8）上的行为保持一致
 */
function toBeijingUnixTs(dateStr: string, time: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  return Math.floor(new Date(Date.UTC(y, m - 1, d, hh - 8, mm, ss)).getTime() / 1000);
}

/** 获取索引中的文档总数（用于诊断） */
export async function getIndexStats(): Promise<{ numberOfDocuments: number } | null> {
  if (!client || !healthy) return null;
  try {
    const stats = await client.index(INDEX_NAME).getStats();
    return { numberOfDocuments: stats.numberOfDocuments };
  } catch {
    return null;
  }
}

/**
 * 按 ID 重新同步指定公告到 Meilisearch
 * 用于 refreshIsActive 变更后，将 is_active 状态同步到索引
 */
export async function syncNoticeIds(pool: Pool, ids: number[]): Promise<{ synced: number }> {
  if (!client || !healthy || ids.length === 0) return { synced: 0 };
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

/** 检测索引中是否存在旧哨兵值(9999999999)的文档——用于一次性迁移检测 */
export async function hasOldSentinel(): Promise<boolean> {
  if (!client || !healthy) return false;
  try {
    const result = await client.index(INDEX_NAME).search("", {
      filter: "deadline_sec >= 9999999999",
      limit: 1,
      attributesToRetrieve: ["id"],
    });
    return result.estimatedTotalHits > 0;
  } catch {
    return false;
  }
}

/** 获取 MySQL 中公告总数（用于 ghost ID 检测，与 Meilisearch 索引口径一致：包含所有公告，无论 is_active） */
export async function getMysqlActiveCount(pool: Pool): Promise<number> {
  try {
    const [rows] = await pool.query("SELECT COUNT(*) AS cnt FROM crm_bid_notices");
    return Number((rows as any[])[0]?.cnt || 0);
  } catch {
    return 0;
  }
}
