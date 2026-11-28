/**
 * Meilisearch 客户端初始化与健康检查
 * Meilisearch client singleton + health check
 *
 * @module lib/services/meilisearch/client
 * @description 使用 globalThis 缓存客户端，防止 Next.js 热重载导致重复初始化。
 */
import { Meilisearch, type Settings } from "meilisearch";
import { isMainThread } from "node:worker_threads";

const INDEX_NAME = "notices";
// 深分页上限：Meilisearch 的 offset 是顺序跳过 N 条，实测（56 万条）
// offset 1 万 686ms / 2 万 1.2s / 5 万 3.0s / 10 万 6.0s，线性增长。
// 原值 1000 万等于允许翻到 50 万页，单请求即可拖垮实例；压到 1 万 = 最多 500 页。
const MAX_TOTAL_HITS = Number(process.env.MEILI_MAX_TOTAL_HITS || "10000");
const REQUEST_TIMEOUT = Number(process.env.MEILI_TIMEOUT_MS || "60000");

// ── 状态唯一存储 = globalThis（2026-11-11 线上事故修复）──
// Turbopack 生产构建会把 server 模块按 chunk 复制多份（实测本模块在产物中出现 8 份），
// 模块级 let 在各副本间互不可见：instrumentation 引导副本 initMeilisearch 建出的
// client，搜索路由的副本永远读不到（恒 null、healthy 恒 false）→ 全部搜索静默降级
// MySQL。因此状态一律即时读写 globalThis，任何副本初始化/翻转对所有副本立即可见。
const globalForMeili = globalThis as unknown as {
  _meiliClient: Meilisearch | null;
  _meiliHealthy: boolean;
  _meiliLastFailureTs: number;
  _meiliFailureStreak: number;
  /** 上次恢复探测时间（独立于失败时间戳，见 tryRecover 注释） */
  _meiliLastProbeTs: number;
};

function getClient(): Meilisearch | null {
  const existing = globalForMeili._meiliClient;
  if (existing) return existing;
  // 懒初始化（2026-11-11 线上事故）：路由与 instrumentation 引导可能运行在隔离
  // 上下文（各持有独立 globalThis），引导副本 initMeilisearch 建出的 client 对
  // 路由上下文不可见 → 路由永远 client=null、静默全量降级 MySQL。任何上下文
  // 发现 client 为空时就地自举（幂等，直接读 process.env；env 在 worker_threads
  // 默认快照共享）。诊断行仅在有请求实际触发懒初始化时打印。
  const client = initMeilisearch();
  if (client) {
    console.warn(
      `[meilisearch] 上下文内懒初始化 client（isMainThread=${isMainThread} host=${process.env.MEILI_HOST ?? "未设置"} keySet=${process.env.MEILI_MASTER_KEY ? "yes" : "no"}）`,
    );
  }
  return client;
}

function isHealthy(): boolean {
  return globalForMeili._meiliHealthy ?? false;
}

function setHealthy(value: boolean): void {
  globalForMeili._meiliHealthy = value;
}

function getLastFailureTs(): number {
  return globalForMeili._meiliLastFailureTs ?? 0;
}

function getFailureStreak(): number {
  return globalForMeili._meiliFailureStreak ?? 0;
}

function getLastProbeTs(): number {
  return globalForMeili._meiliLastProbeTs ?? 0;
}

const RECOVER_COOLDOWN_MS = 10_000;
const HEALTH_PROBE_TIMEOUT_MS = 2_000;
// 2026-11-11 线上事故：重启后页缓存全冷、iowait 高企，偶发连接错误单次就打翻
// 健康位，造成「降级 MySQL ↔ 恢复 Meili」全天抖动，每个抖动窗口都在生产
// 15s 超时的降级空集。改为：连续失败达阈值才判不健康，任一次成功即清零；
// 距上次失败超过窗口期的孤立错误不计入连击。
const UNHEALTHY_STREAK_THRESHOLD = 2;
const FAILURE_STREAK_WINDOW_MS = 60_000;

/** 初始化 Meilisearch 客户端（幂等） */
export function initMeilisearch(): Meilisearch | null {
  const host = process.env.MEILI_HOST || "http://127.0.0.1:7700";
  const key = process.env.MEILI_MASTER_KEY || "";
  try {
    const client = new Meilisearch({ host, apiKey: key || undefined, timeout: REQUEST_TIMEOUT });
    globalForMeili._meiliClient = client;
    return client;
  } catch (err) {
    console.warn("[meilisearch] init failed:", (err as Error).message);
    globalForMeili._meiliClient = null;
    return null;
  }
}

export { getClient, isHealthy };

/** 一次成功的 Meilisearch 交互：清零失败连击（调用方在检索成功后调用） */
export function noteMeiliSuccess(): void {
  globalForMeili._meiliFailureStreak = 0;
}

/**
 * 标记 Meilisearch 不健康（搜索连接类失败时调用）。
 * 单次瞬时失败只记连击、不打翻健康位（2026-11-11 事故：高 iowait 下偶发
 * 连接错误曾造成健康位全天抖动）；连续失败达阈值才真正降级。
 */
export function markUnhealthy(): void {
  const now = Date.now();
  // 超出窗口期的孤立错误不计入连击
  let streak = getFailureStreak();
  if (now - getLastFailureTs() > FAILURE_STREAK_WINDOW_MS) streak = 0;
  streak += 1;
  globalForMeili._meiliFailureStreak = streak;
  globalForMeili._meiliLastFailureTs = now;
  if (isHealthy() && streak < UNHEALTHY_STREAK_THRESHOLD) {
    console.warn(
      `[meilisearch] 瞬时失败 ${streak}/${UNHEALTHY_STREAK_THRESHOLD}，暂不降级（连续失败才切换）`,
    );
    return;
  }
  if (isHealthy()) {
    console.warn("[meilisearch] 运行时探测失败，标记为不健康，搜索将降级到 MySQL");
  }
  setHealthy(false);
}

/**
 * 尝试恢复健康状态（搜索前调用）
 * 冷却期内不重复探测，避免对故障中的 Meilisearch 造成额外压力
 * @returns true 表示健康（可继续使用），false 表示仍不健康
 */
export async function tryRecover(): Promise<boolean> {
  if (isHealthy()) return true;
  const client = getClient();
  if (!client) return false;
  // [2026-11-15 事故] 冷却原本复用 markUnhealthy 写的失败时间戳，于是每次失败
  // 都把「下次可探测」往后推 10 秒：降级期间只要还有别的失败源（后台同步、
  // 并发搜索）在刷新该时间戳，探测就永远进不来，健康位再也翻不回去——本机实测
  // Meilisearch 晚起 4 分钟，之后 45 分钟一次都没恢复，只能重启应用。
  // 改为独立记录「上次探测时间」：探测按固定节奏进行，不被失败事件饿死。
  const now = Date.now();
  if (now - getLastProbeTs() < RECOVER_COOLDOWN_MS) return false;
  globalForMeili._meiliLastProbeTs = now;
  try {
    // M-DEG-1 修复：健康探测增加独立短超时，避免 Meilisearch 进程崩溃时
    // TCP 连接等待 30s 才超时，阻塞搜索降级路径
    const healthPromise = client.health();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`health probe timeout after ${HEALTH_PROBE_TIMEOUT_MS}ms`)), HEALTH_PROBE_TIMEOUT_MS)
    );
    const health = await Promise.race([healthPromise, timeoutPromise]);
    const nowHealthy = health.status === "available";
    setHealthy(nowHealthy);
    if (nowHealthy) {
      noteMeiliSuccess();
      console.log("[meilisearch] 运行时探测恢复成功，重新启用 Meilisearch 搜索");
    }
    return nowHealthy;
  } catch (err) {
    // 打印原因：旧实现静默吞掉，事故期间无法从日志区分「服务没起」与「鉴权/网络不对」
    console.warn(`[meilisearch] 恢复探测失败，继续降级 MySQL：${(err as Error).message}`);
    return false;
  }
}

export function getIndexName(): string {
  return INDEX_NAME;
}

/**
 * 从公告索引删除指定文档（撤回/到期下架时同步清理，避免列表仍能搜到）。
 * 主键 = bid_notices.id = notice_public.notice_pk。
 */
export async function deleteNoticeDocuments(ids: number[]): Promise<void> {
  const valid = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (valid.length === 0) return;
  const client = getClient();
  if (!client) return;
  await client.index(INDEX_NAME).deleteDocuments(valid);
}

/**
 * 公告索引的完整设置（searchable/filterable/sortable/ranking/pagination）
 * P2-13：抽出为共享函数，供 ensureIndex 与 fullSync 的临时索引共同使用，
 * 保证 swapIndexes 切换后新索引设置与旧索引完全一致。
 */
export function buildNoticeIndexSettings(): Settings {
  // 2026-11-28 零映射：文档字段名统一为服务表原生列名（title_cn / deadline_ts / has_attachments…），
  // 不再保留宽表时代的 title_zh / deadline_sec / documents_count 等别名。
  // 内容语言只有「原文 + 中文 + 英文」三组，写死枚举（不要用 SUPPORTED_LANGS 生成，
  // 它的 zh 会拼成 title_zh —— 文档里根本没有这个字段，中文检索会整块失联）。
  const contentFields = [
    "title_cn", "description_cn",
    "title_en", "description_en",
  ];
  return {
    searchableAttributes: [
      "reference",
      "title",
      "description",
      ...contentFields,
    ],
    filterableAttributes: [
      "country_code",
      "country_codes",
      "buyer_name",
      "notice_type_code",
      "deadline_ts",
      "is_opportunity",
      "reference",
      // 预算区间筛选（filter-builder 生成 estimated_value >= / <= 过滤）
      "estimated_value",
      // 「含原始文件」筛选依据（服务表生成列 has_attachments）
      "has_attachments",
      // 品目树五级下拉与可见性判定的参与过滤属性（由 backbone_path 拆数组，见 sync.ts）
      "backbone_node",
    ],
    sortableAttributes: ["deadline_ts", "id", "has_deadline"],
    rankingRules: [
      "words",
      "typo",
      "proximity",
      "attribute",
      "exactness",
      "sort",
    ],
    // ── 中文分词升级（Meilisearch 1.8 起提供原生 CJK 分词能力，替代 jieba 手动预处理）──
    // 配置 CJK 语言（zho）即启用引擎内置中文分词，索引与查询两侧口径对称；
    // 其余语言仅获得对应停用词/词法处理，拉丁/西里尔/阿拉伯字段不受影响。
    // 注意：不再手动设置 stopWords——显式设置会覆盖内置停用词表，交由语言配置管理。
    // 字段版本：v1.11 起 `configuredLanguages` 被重命名为 `localizedAttributes`（v1.12 彻底移除旧名），
    // 且格式由语言码数组改为「按属性模式分组」的对象数组，故此处使用 localizedAttributes。
    localizedAttributes: [
      { attributePatterns: ["*"], locales: ["zho", "eng", "fra", "rus", "spa", "ara"] },
    ],
    // 领域专有名词：作为单一词条解析，避免被原生分词器过度切分降低召回。
    dictionary: [
      "联合国采购",
      "联合国",
      "世界粮食计划署",
      "联合国开发计划署",
      "联合国儿童基金会",
      "世界卫生组织",
      "采购机会",
      "投标资格",
    ],
    // 检索侧仅取 id（meiliQuery/getLastSyncedId 均 attributesToRetrieve:["id"]），
    // 收敛 displayedAttributes 可显著缩减索引体积、加快 swap 后加载。
    displayedAttributes: ["id"],
    // 服务端搜索熔断：低于客户端 5s 超时，高负载时返回部分结果而非整体降级 MySQL。
    searchCutoffMs: Number(process.env.MEILI_SEARCH_CUTOFF_MS || 4000),
    pagination: {
      maxTotalHits: MAX_TOTAL_HITS,
    },
  };
}

/** 启动时健康检查 + 索引初始化 */
export async function ensureIndex(): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    const health = await client.health();
    setHealthy(health.status === "available");
  } catch {
    setHealthy(false);
    console.warn("[meilisearch] health check failed — search will fallback to MySQL LIKE");
    return false;
  }
  if (!isHealthy()) return false;

  try {
    // 索引不存在时先创建（已存在则 createIndex 会返回已取消的任务，不影响后续操作）
    try {
      await client.createIndex(INDEX_NAME, { primaryKey: "id" });
    } catch {
      // index_already_exists 或幂等冲突，忽略
    }
    const index = client.index(INDEX_NAME);
    // P2-13：设置与 fullSync 临时索引同源（buildNoticeIndexSettings），
    // 保证 swapIndexes 切换后设置完全一致
    await index.updateSettings(buildNoticeIndexSettings());
    return true;
  } catch (err) {
    console.warn("[meilisearch] ensureIndex failed:", (err as Error).message);
    return false;
  }
}

/** 获取索引中的文档总数（用于诊断） */
export async function getIndexStats(): Promise<{ numberOfDocuments: number } | null> {
  const client = getClient();
  if (!client || !isHealthy()) return null;
  try {
    const stats = await client.index(INDEX_NAME).getStats();
    return { numberOfDocuments: stats.numberOfDocuments };
  } catch {
    return null;
  }
}

/**
 * 获取 Meilisearch 索引中已同步的最大文档 ID
 * @returns null 表示「读不到」（未初始化/不健康/请求异常），调用方严禁当作 0 处理：
 *          0 只表示索引确实为空（查询成功且无命中）
 */
export async function getLastSyncedId(): Promise<number | null> {
  const client = getClient();
  if (!client || !isHealthy()) return null;
  try {
    const result = await client.index(INDEX_NAME).search("", {
      sort: ["id:desc"],
      limit: 1,
      attributesToRetrieve: ["id"],
    });
    if (result.hits.length > 0) return Number(result.hits[0].id) || 0;
    return 0;
  } catch {
    return null;
  }
}

/**
 * 获取 Meilisearch 索引中的文档总数
 * @returns null 表示「读不到」（未初始化/不健康/请求异常），调用方严禁当作 0 处理：
 *          0 只表示索引确实为空（stats 查询成功）
 */
export async function getDocCount(): Promise<number | null> {
  const client = getClient();
  if (!client || !isHealthy()) return null;
  try {
    const stats = await client.index(INDEX_NAME).getStats();
    return stats.numberOfDocuments || 0;
  } catch {
    return null;
  }
}

/** [P1-B] 带 60s 缓存的文档总数（编排器空索引预检用，避免高频 getStats） */
let _docCountCache: { value: number; expires: number } | null = null;
const DOC_COUNT_CACHE_TTL = 60 * 1000;

/** @returns null 表示读不到（不缓存，避免把失败结果固化 60 秒） */
export async function getCachedDocCount(): Promise<number | null> {
  if (_docCountCache && _docCountCache.expires > Date.now()) return _docCountCache.value;
  const value = await getDocCount();
  if (value === null) return null;
  _docCountCache = { value, expires: Date.now() + DOC_COUNT_CACHE_TTL };
  return value;
}

/** 检测索引中是否存在旧哨兵值(9999999999)的文档 */
export async function hasOldSentinel(): Promise<boolean> {
  const client = getClient();
  if (!client || !isHealthy()) return false;
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

/**
 * 检测索引是否已包含 has_deadline 字段（用于判断是否需要全量重建）
 * @returns null 表示读不到 stats（不健康/异常），此时不可判定为「缺字段」，
 *          否则一次瞬时超时就会被当成缺字段，触发整表重建
 */
export async function hasHasDeadlineField(): Promise<boolean | null> {
  const client = getClient();
  if (!client || !isHealthy()) return null;
  try {
    const stats = await client.index(INDEX_NAME).getStats();
    return !!(stats as { fieldDistribution?: Record<string, unknown> }).fieldDistribution?.has_deadline;
  } catch {
    return null;
  }
}

