import { RFQ_STATUS } from "@/shared/constants/rfq";
/**
 * 公告过期判定统一常量
 * Unified notice expiry constants
 *
 * @module server/utils/notice-expired
 * @description 全系统唯一的"有效公告"SQL 口径定义。
 *              所有查询路径（搜索、推荐、行业匹配、统计、翻译）必须引用本模块常量，
 *              禁止在业务代码中硬编码 is_expired / deadline_ts / deadline_sec 判定表达式。
 *
 *              设计原则：
 *              - 唯一事实源：deadline_sec 生成列（基于 deadline_ts 自动计算）
 *              - deadline_sec = 0 表示无截止日期（永不过期），含 deadline_ts IS NULL 和 deadline_ts = 0
 *              - deadline_sec >= UNIX_TIMESTAMP(NOW()) 表示未过期
 *              - 不依赖 is_expired 字段（由外部管道批量设置，可能滞后于实际截止时间）
 *
 *              [修复 030-b] 原条件仅检查 deadline_ts IS NULL，遗漏了 deadline_ts = 0（NOT NULL
 *              但值为 0）的 ~10,849 条记录。这些记录在宽表/Meilisearch 侧被正确视为"无截止
 *              日期"（deadline_sec = 0），但主表条件将其排除，导致不同排序返回不同 total。
 *              统一改为基于 deadline_sec = 0 判定，与宽表/Meilisearch 口径完全对齐。
 *
 *              别名约定：
 *              - ACTIVE_NOTICE_WHERE  使用 n. 别名（crm_bid_notices n）
 *              - ACTIVE_OPP_WHERE     使用 o. 别名（crm_bid_opportunities o）
 *              - ACTIVE_NOTICE_WHERE_NO_ALIAS 无别名（统计表 / 子查询）
 *              - MEILI_ACTIVE_FILTER  Meilisearch 索引侧等价 filter
 */

/** deadline_sec 列引用（带 n. 表别名），用于 ORDER BY / SELECT / 表达式拼接 */
export const DEADLINE_SEC_EXPR = "n.deadline_sec";

/**
 * 平台用户 RFQ 未发布排除片段（n. 别名）
 *
 * 语义：仅爬虫/外部数据（entry_source <> 'platform'）或已发布（rfq_status = 'published'）
 *       的平台 RFQ 允许进入公开搜索/SEO/sitemap/推荐/统计。
 *       平台用户发布的 RFQ 在通过审核前（draft / pending_review）不得对外可见。
 *       注意：rfq_status 对爬虫历史行为 NULL，用 IFNULL 兜底。
 */
export const PLATFORM_PUBLISHED_ONLY = `(n.entry_source <> 'platform' OR IFNULL(n.rfq_status, '') = ${JSON.stringify(RFQ_STATUS.PUBLISHED)})`;

/** 同上，无表别名版本（单表查询） */
export const PLATFORM_PUBLISHED_ONLY_NO_ALIAS =
  `(entry_source <> 'platform' OR IFNULL(rfq_status, '') = ${JSON.stringify(RFQ_STATUS.PUBLISHED)})`;

/**
 * 有效公告 WHERE 片段（n. 别名）—— MySQL 查询主口径
 *
 * 语义：无截止日期（deadline_sec = 0 → 永不过期，含 deadline_ts IS NULL 和 deadline_ts = 0）
 *       或截止日期未到（deadline_sec >= 当前时间戳）
 *
 * [修复 030-b] 原条件 `deadline_ts IS NULL` 遗漏 deadline_ts=0 的 ~10,849 条记录，
 * 改为 `deadline_sec = 0` 与宽表/Meilisearch 口径完全对齐。
 *
 * 适用表：crm_bid_notices（别名 n）
 */
export const ACTIVE_NOTICE_WHERE =
  "(n.deadline_sec = 0 OR n.deadline_sec >= UNIX_TIMESTAMP(NOW())) AND " +
  PLATFORM_PUBLISHED_ONLY;

/**
 * 有效公告 WHERE 片段（o. 别名）—— 用于 crm_bid_opportunities 表
 *
 * 适用表：crm_bid_opportunities（别名 o）
 */
export const ACTIVE_OPP_WHERE =
  "(o.deadline_sec = 0 OR o.deadline_sec >= UNIX_TIMESTAMP(NOW()))";

/**
 * 有效公告 WHERE 片段（无表别名）—— 用于统计表或表别名不同的场景
 *
 * 适用场景：crm_notice_stats 刷新、getNoticeStats 等
 */
export const ACTIVE_NOTICE_WHERE_NO_ALIAS =
  "(deadline_sec = 0 OR deadline_sec >= UNIX_TIMESTAMP(NOW())) AND " +
  PLATFORM_PUBLISHED_ONLY_NO_ALIAS;

/**
 * Meilisearch 索引侧等价 filter
 *
 * 与 MySQL 侧 ACTIVE_NOTICE_WHERE 语义一致：
 * - deadline_sec = 0 → 无截止日期（永不过期，含 deadline_ts IS NULL 和 deadline_ts = 0）
 * - deadline_sec >= 当前时间戳 → 未过期
 */
export const MEILI_ACTIVE_FILTER =
  "(deadline_sec = 0 OR deadline_sec >= {now})";

/**
 * 将日期字符串按北京时间（UTC+8）解析为 Unix 时间戳
 *
 * 导出供 Meilisearch filter 构建与 MySQL 降级路径复用，确保两条路径时区一致。
 * 原定义于 meilisearch/search.ts，迁移至此以消除对已删除模块的依赖。
 */
export function toBeijingUnixTs(dateStr: string, time: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  return Math.floor(new Date(Date.UTC(y, m - 1, d, hh - 8, mm, ss)).getTime() / 1000);
}
