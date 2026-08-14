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
 *              - deadline_sec = 0 表示无截止日期（永不过期）
 *              - deadline_sec >= UNIX_TIMESTAMP(NOW()) 表示未过期
 *              - 不依赖 is_expired 字段（由外部管道批量设置，可能滞后于实际截止时间）
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
 * 有效公告 WHERE 片段（n. 别名）—— MySQL 查询主口径
 *
 * 语义：无截止日期（deadline_ts IS NULL → deadline_sec = 0 → 永不过期）
 *       或截止日期未到（deadline_sec >= 当前时间戳）
 *
 * 适用表：crm_bid_notices（别名 n）
 */
export const ACTIVE_NOTICE_WHERE =
  "(n.deadline_ts IS NULL OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))";

/**
 * 有效公告 WHERE 片段（o. 别名）—— 用于 crm_bid_opportunities 表
 *
 * 适用表：crm_bid_opportunities（别名 o）
 */
export const ACTIVE_OPP_WHERE =
  "(o.deadline_ts IS NULL OR o.deadline_sec >= UNIX_TIMESTAMP(NOW()))";

/**
 * 有效公告 WHERE 片段（无表别名）—— 用于统计表或表别名不同的场景
 *
 * 适用场景：crm_notice_stats 刷新、getNoticeStats 等
 */
export const ACTIVE_NOTICE_WHERE_NO_ALIAS =
  "(deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW()))";

/**
 * Meilisearch 索引侧等价 filter
 *
 * 与 MySQL 侧 ACTIVE_NOTICE_WHERE 语义一致：
 * - deadline_sec = 0 → 无截止日期（永不过期）
 * - deadline_sec >= 当前时间戳 → 未过期
 *
 * 注意：Meilisearch 索引中没有 deadline_ts 列，deadline_sec = 0 等价于 MySQL 侧
 * deadline_ts IS NULL。同步逻辑见 meilisearch/sync.ts。
 */
export const MEILI_ACTIVE_FILTER =
  "(deadline_sec = 0 OR deadline_sec >= {now})";
