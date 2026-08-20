/**
 * Meilisearch 条件搜索
 * Meilisearch filtered search
 *
 * @module server/services/meilisearch/search
 */
import { getClient, isHealthy, getIndexName, markUnhealthy, tryRecover } from "./client";
import { normalizeNoticeType } from "../../utils/notice-type";
import { MEILI_ACTIVE_FILTER } from "../../utils/notice-expired";

/** 转义 Meilisearch filter 字符串中的双引号和反斜杠 */
function escapeFilter(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * BUG-SRC-2 修复：将日期字符串按北京时间（UTC+8）解析为 Unix 时间戳
 * 导出供 MySQL 降级路径复用，确保两条路径时区一致
 */
export function toBeijingUnixTs(dateStr: string, time: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  return Math.floor(new Date(Date.UTC(y, m - 1, d, hh - 8, mm, ss)).getTime() / 1000);
}

/**
 * 条件搜索：通过 Meilisearch 执行多条件筛选 + 排序 + 分页，返回 ID 列表 + 总数
 * 返回 null 表示搜索失败（调用方降级到 MySQL）
 */
export async function searchWithFilters(params: {
  q?: string;
  country?: string;
  /** 国家名变体列表（大写形式），用于 OR 匹配索引中的不同存储形式 */
  countryVariants?: string[];
  agencies?: string[];
  agencyGroup?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  deadlineWithinDays?: number;
  noticeType?: string;
  featuredOnly?: boolean;
  unspscLevel?: number;
  unspscLevelId?: string;
  /** 行业匹配模式（mode=prefs）：使用 precise_level{N}_id 而非 TED 标签 level{N}_id */
  unspscPrecise?: boolean;
  sort?: string;
  page: number;
  pageSize: number;
}): Promise<{ ids: number[]; total: number; totalIsPrecise: boolean } | null> {
  const client = getClient();
  if (!client) return null;
  // 运行时健康探测：如果不健康，尝试恢复（冷却期内自动跳过）
  if (!isHealthy()) {
    const recovered = await tryRecover();
    if (!recovered) return null;
  }
  const INDEX_NAME = getIndexName();

  try {
    const {
      q, country, countryVariants, agencies, agencyGroup, deadlineFrom, deadlineTo,
      deadlineWithinDays, noticeType, featuredOnly,
      unspscLevel, unspscLevelId, unspscPrecise,
      sort, page, pageSize,
    } = params;

    const filter: string[] = [
      // 与 MySQL 侧 ACTIVE_NOTICE_WHERE 语义一致：deadline_sec = 0 表示无截止日期（永不过期）
      MEILI_ACTIVE_FILTER.replace("{now}", String(Math.floor(Date.now() / 1000)))
    ];
    // 国家筛选：使用所有已知形式（原始大小写 + 大写）做 OR 匹配
    // 覆盖索引中可能存储的不同大小写变体（如 "Brazil" / "BRAZIL"）
    if (country) {
      if (countryVariants && countryVariants.length > 1) {
        const orParts = countryVariants.map((v) => `country = "${escapeFilter(v)}"`).join(" OR ");
        filter.push(`(${orParts})`);
      } else {
        filter.push(`country = "${escapeFilter(country)}"`);
      }
    }
    // 机构筛选：优先使用聚合组，否则使用标准化后的机构名
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
      // 修复：排除无截止日期文档（deadline_sec = 0），与 MySQL 路径 deadline_sec > 0 语义一致
      filter.push(`deadline_sec > 0 AND deadline_sec <= ${futureTs}`);
    }
    if (noticeType) {
      const normalized = normalizeNoticeType(noticeType);
      filter.push(`notice_type_normalized = "${escapeFilter(normalized)}"`);
    }
    if (featuredOnly) filter.push("is_featured = 1");
    if (unspscLevel && unspscLevel >= 1 && unspscLevel <= 5 && unspscLevelId) {
      // 行业匹配模式使用 precise_level{N}_id（approved 候选码），普通搜索使用 level{N}_id（TED 标签）
      const prefix = unspscPrecise ? "precise_" : "";
      filter.push(`${prefix}level${unspscLevel}_id = "${escapeFilter(unspscLevelId)}"`);
    }

    const sortArr: string[] = [];
    if (sort === "latest") {
      sortArr.push("id:desc");
    } else if (sort === "deadline") {
      // 最近截止：有截止日期的优先（has_deadline:desc），然后按截止日期升序
      sortArr.push("has_deadline:desc", "deadline_sec:asc", "id:desc");
    } else {
      // 最远截止：有截止日期的优先（has_deadline:desc），然后按截止日期降序
      sortArr.push("has_deadline:desc", "deadline_sec:desc", "id:desc");
    }

    // [修复 030-b] 移除 deadline_nearest 的 deadline_sec>0 额外过滤。
    // 原 PERF 优化为避免升序排序跳过大量零值文档，但 has_deadline:desc 排序已
    // 将 deadline_sec=0 记录推至末尾，功能等价。额外过滤导致 total 与其他排序
    // 不一致（差 ~10,849 条"无截止日期"记录），违反"排序不影响总数"预期。

    const offset = (page - 1) * pageSize;
    const SEARCH_TIMEOUT_MS = 5000;
    const searchPromise = client.index(INDEX_NAME).search(q || "", {
      filter,
      sort: sortArr,
      limit: pageSize,
      offset,
      attributesToRetrieve: ["id"],
      matchingStrategy: "all",
    });
    // M-PERF-1 修复：保存定时器 ID，搜索完成后立即清理，避免高频搜索场景下悬挂定时器堆积
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<null>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Meilisearch search timeout after ${SEARCH_TIMEOUT_MS}ms`)), SEARCH_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([searchPromise, timeoutPromise]) as any;
      if (result === null) return null;

      const ids = result.hits.map((h: any) => Number(h.id)).filter(Boolean);
      // P0 修复：优先使用 totalHits（精确值，Meilisearch v1.7+），降级到 estimatedTotalHits
      const preciseTotal = result.totalHits ?? null;
      const estimatedTotal = result.estimatedTotalHits ?? ids.length;
      return { ids, total: preciseTotal ?? estimatedTotal, totalIsPrecise: preciseTotal !== null };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  } catch (err) {
    console.warn("[meilisearch] searchWithFilters failed:", (err as Error).message);
    // 搜索失败/超时：标记为不健康，后续请求将自动降级到 MySQL 并尝试恢复
    markUnhealthy();
    return null;
  }
}
