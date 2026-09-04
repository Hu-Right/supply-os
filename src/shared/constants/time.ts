/**
 * 时间常量（毫秒单位）
 * Time duration constants (milliseconds)
 *
 * @module shared/constants/time
 * @description 统一全库散落的魔法数字时间表达式（如 `10 * 60 * 1000`、`60_000`），
 *              提供语义化的命名常量，消除"10 分钟到底是多少 ms"的心智负担。
 *              使用 UPPER_SNAKE_CASE 命名，值均为 number（ms）。
 */

// ── 基础单位 ─────────────────────────────────────────────────────────────────

/** 1 秒（毫秒） */
export const ONE_SECOND_MS = 1_000;

/** 1 分钟（毫秒） */
export const ONE_MINUTE_MS = 60_000;

/** 1 小时（毫秒） */
export const ONE_HOUR_MS = 3_600_000;

// ── 验证码 / 短时凭据有效期 ───────────────────────────────────────────────────

/** 短信/邮箱验证码有效期（10 分钟） */
export const VERIFICATION_CODE_EXPIRES_MS = 10 * ONE_MINUTE_MS;

/** 密码重置链接有效期（15 分钟） */
export const PASSWORD_RESET_EXPIRES_MS = 15 * ONE_MINUTE_MS;

/** 培训订单支付超时（30 分钟） */
export const TRAINING_ORDER_EXPIRES_MS = 30 * ONE_MINUTE_MS;

/** SSE 一次性 Ticket 有效期（60 秒） */
export const CHAT_TICKET_TTL_MS = 60_000;

// ── 缓存 TTL ──────────────────────────────────────────────────────────────────

/** 短时缓存 TTL（1 分钟）——行业画像、文档计数、宽表就绪状态 */
export const CACHE_TTL_SHORT_MS = ONE_MINUTE_MS;

/** 标准缓存 TTL（5 分钟）——搜索结果、推荐、API 客户端默认 */
export const CACHE_TTL_STANDARD_MS = 5 * ONE_MINUTE_MS;

/** 中时缓存 TTL（10 分钟）——金额偏好、兴趣码、机构名、精选公告 */
export const CACHE_TTL_MEDIUM_MS = 10 * ONE_MINUTE_MS;

/** 长时缓存 TTL（30 分钟）——对账日志 */
export const CACHE_TTL_LONG_MS = 30 * ONE_MINUTE_MS;

// ── 定时任务间隔 ───────────────────────────────────────────────────────────────

/** SSE 心跳帧间隔（25 秒） */
export const SSE_HEARTBEAT_INTERVAL_MS = 25_000;

/** SSE 轮询间隔（2 秒） */
export const SSE_POLL_INTERVAL_MS = 2_000;

/** SSE 最大空闲超时（5 分钟） */
export const SSE_MAX_IDLE_MS = 5 * ONE_MINUTE_MS;

/** 精选公告刷新间隔（30 分钟） */
export const FEATURED_REFRESH_INTERVAL_MS = 30 * ONE_MINUTE_MS;

/** 统计刷新间隔（10 分钟） */
export const STATS_REFRESH_INTERVAL_MS = 10 * ONE_MINUTE_MS;

/** 支付维护扫描间隔（1 小时） */
export const PAYMENT_MAINTENANCE_INTERVAL_MS = ONE_HOUR_MS;

/** 报告缓存清理检查间隔（6 小时） */
export const REPORT_CACHE_CLEANUP_INTERVAL_MS = 6 * ONE_HOUR_MS;

/** 翻译批次间隔（200ms） */
export const TRANSLATION_BATCH_DELAY_MS = 200;

/** 回填批间限速（50ms） */
export const BACKFILL_BATCH_SLEEP_MS = 50;

/** 回填批大小 */
export const BACKFILL_BATCH_SIZE = 2_000;
