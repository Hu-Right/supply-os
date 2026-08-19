/**
 * Meilisearch 客户端初始化与健康检查
 * Meilisearch client singleton + health check
 *
 * @module server/services/meilisearch/client
 */
import { Meilisearch } from "meilisearch";

const INDEX_NAME = "notices";
const MAX_TOTAL_HITS = Number(process.env.MEILI_MAX_TOTAL_HITS || "10000000");
// 超时：批量写入大量多语言文档时需要更长，默认 30 秒（可通过 MEILI_TIMEOUT_MS 覆盖）
const REQUEST_TIMEOUT = Number(process.env.MEILI_TIMEOUT_MS || "30000");

let client: Meilisearch | null = null;
let healthy = false;
// 运行时健康探测：记录上次失败时间，避免每次请求都探测
let lastFailureTs = 0;
const RECOVER_COOLDOWN_MS = 10_000; // 探测冷却期：10 秒内不重复探测
// M-DEG-1 修复：健康探测独立超时（2 秒），不复用客户端 30s 请求超时
// 健康端点极轻量，正常响应 < 50ms；30s 超时会阻塞搜索降级路径
const HEALTH_PROBE_TIMEOUT_MS = 2_000;

/** 初始化 Meilisearch 客户端（幂等） */
export function initMeilisearch(): Meilisearch | null {
  const host = process.env.MEILI_HOST || "http://127.0.0.1:7700";
  const key = process.env.MEILI_MASTER_KEY || "";
  try {
    client = new Meilisearch({ host, apiKey: key || undefined, timeout: REQUEST_TIMEOUT });
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

/** 标记 Meilisearch 不健康（搜索超时/失败时调用） */
export function markUnhealthy(): void {
  if (healthy) {
    console.warn("[meilisearch] 运行时探测失败，标记为不健康，搜索将降级到 MySQL");
  }
  healthy = false;
  lastFailureTs = Date.now();
}

/**
 * 尝试恢复健康状态（搜索前调用）
 * 冷却期内不重复探测，避免对故障中的 Meilisearch 造成额外压力
 * @returns true 表示健康（可继续使用），false 表示仍不健康
 */
export async function tryRecover(): Promise<boolean> {
  if (healthy) return true;
  if (!client) return false;
  // 冷却期内不探测
  if (Date.now() - lastFailureTs < RECOVER_COOLDOWN_MS) return false;
  try {
    // M-DEG-1 修复：健康探测增加独立短超时，避免 Meilisearch 进程崩溃时
    // TCP 连接等待 30s 才超时，阻塞搜索降级路径
    const healthPromise = client.health();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`health probe timeout after ${HEALTH_PROBE_TIMEOUT_MS}ms`)), HEALTH_PROBE_TIMEOUT_MS)
    );
    const health = await Promise.race([healthPromise, timeoutPromise]);
    healthy = health.status === "available";
    if (healthy) {
      console.log("[meilisearch] 运行时探测恢复成功，重新启用 Meilisearch 搜索");
    }
    return healthy;
  } catch {
    lastFailureTs = Date.now(); // 刷新冷却计时
    return false;
  }
}

export function getIndexName(): string {
  return INDEX_NAME;
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
    // 索引不存在时先创建（已存在则 createIndex 会返回已取消的任务，不影响后续操作）
    try {
      await client.createIndex(INDEX_NAME, { primaryKey: "id" });
    } catch {
      // index_already_exists 或幂等冲突，忽略
    }
    const index = client.index(INDEX_NAME);
    // 支持的语言列表（扩展语言只需在此添加）
    const SUPPORTED_LANGS = ["zh", "en", "fr", "ru", "es", "ar"];
    const langFields = SUPPORTED_LANGS.flatMap(lang => [`title_${lang}`, `description_${lang}`]);
    
    await index.updateSettings({
      searchableAttributes: [
        "reference",
        "title",
        "description",
        ...langFields,
      ],
      filterableAttributes: [
        "country",
        "agency",
        "agency_group",
        "notice_type_normalized",
        "deadline_sec",
        "is_featured",
        "level1_id",
        "level2_id",
        "level3_id",
        "level4_id",
        "level5_id",
        "precise_level1_id",
        "precise_level2_id",
        "precise_level3_id",
        "precise_level4_id",
        "precise_level5_id",
      ],
      sortableAttributes: ["deadline_sec", "id", "has_deadline"],
      rankingRules: [
        "words",
        "typo",
        "proximity",
        "attribute",
        "exactness",
        "sort",
      ],
      pagination: {
        maxTotalHits: MAX_TOTAL_HITS,
      },
    });
    return true;
  } catch (err) {
    console.warn("[meilisearch] ensureIndex failed:", (err as Error).message);
    return false;
  }
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

/** 获取 Meilisearch 索引中已同步的最大文档 ID */
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

/** 获取 Meilisearch 索引中的文档总数 */
export async function getDocCount(): Promise<number> {
  if (!client || !healthy) return 0;
  try {
    const stats = await client.index(INDEX_NAME).getStats();
    return stats.numberOfDocuments || 0;
  } catch {
    return 0;
  }
}

/** 检测索引中是否存在旧哨兵值(9999999999)的文档 */
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

/** 检测索引是否已包含 has_deadline 字段（用于判断是否需要全量重建） */
export async function hasHasDeadlineField(): Promise<boolean> {
  if (!client || !healthy) return false;
  try {
    const stats = await client.index(INDEX_NAME).getStats();
    return !!(stats as any).fieldDistribution?.has_deadline;
  } catch {
    return false;
  }
}
