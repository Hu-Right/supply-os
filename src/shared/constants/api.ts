/**
 * API 错误码与分页限制常量
 * API error codes and pagination limit constants
 *
 * @module shared/constants/api
 * @description 统一全库路由层散落的业务错误码（如 40022、40042）与分页限制参数，
 *              避免同一含义的错误码在不同路由文件中写法不一致。
 *              错误码命名规则：EC_<HTTP状态前缀>_<语义>，值 = 5 位整数。
 */

// ── 业务错误码（Business Error Codes）──────────────────────────────────────────
// 编码规则：4xxxx = 客户端错误，5xxxx = 服务端错误
// 400xx = 参数/校验类，401xx = 认证类，403xx = 授权类，404xx = 资源不存在类

/** 通用参数校验失败（Invalid request body / params） */
export const EC_INVALID_REQUEST = 40022;

/** 认证失败 / 未登录（Authentication required） */
export const EC_AUTH_REQUIRED = 40042;

/** 无权限 / 越权（Forbidden / ownership mismatch） */
export const EC_FORBIDDEN = 40003;

/** 资源不存在（Not found：公告/用户/会话/学习资料/供应商/线索） */
export const EC_NOT_FOUND = 40044;

/** 服务器内部错误（Internal server error） */
export const EC_INTERNAL_ERROR = 50000;

/** 验证码无效 / 已过期（Invalid verification code） */
export const EC_INVALID_CODE = 40007;

/** 密码错误 / 账号状态异常（Account issue） */
export const EC_ACCOUNT_ISSUE = 40003;

/** 手机号格式/绑定问题（Phone binding issue） */
export const EC_PHONE_ISSUE = 40011;

/** 邮箱格式/绑定问题（Email binding issue） */
export const EC_EMAIL_ISSUE = 40010;

/** 已注册 / 重复操作（Duplicate operation） */
export const EC_DUPLICATE = 40008;

/** VIP 专属功能（VIP-only feature） */
export const EC_VIP_ONLY = 40041;

/** 翻译服务不可用（Translation service unavailable） */
export const EC_TRANSLATION_UNAVAILABLE = 50001;

/** 公告不存在（Notice not found — 翻译/内容/预览场景） */
export const EC_NOTICE_NOT_FOUND = 40006;

/** 认证失败 / 未登录（路由层通用，替代各路由散落的 USER_REQUIRED: 40001） */
export const EC_USER_REQUIRED = 40001;

/** 支付渠道不可用 */
export const EC_PAYMENT_PROVIDER_UNAVAILABLE = 40010;

/** 支付二维码缺失（服务端错误） */
export const EC_PAYMENT_QR_CODE_MISSING = 50001;

/** 支付订单不存在 */
export const EC_PAYMENT_ORDER_NOT_FOUND = 40402;

/** 无权限 / 越权（支付/报告/培训订单等场景，统一 40301） */
export const EC_ACCESS_FORBIDDEN = 40301;

/** 培训订单不存在 */
export const EC_TRAINING_ORDER_NOT_FOUND = 40406;

/** 培训订单归属校验失败 */
export const EC_TRAINING_ORDER_FORBIDDEN = 40303;

/** 培训订单尚未支付 */
export const EC_TRAINING_ORDER_NOT_PAID = 40020;

/** 学员信息无效 */
export const EC_TRAINING_PARTICIPANTS_INVALID = 40021;

/** 学员数量不匹配 */
export const EC_TRAINING_PARTICIPANTS_COUNT_MISMATCH = 40022;

/** 公告不存在（404 语义版本，与 EC_NOTICE_NOT_FOUND 40006 共存供不同场景选用） */
export const EC_NOTICE_NOT_FOUND_404 = 40404;

/** 报告不可用 */
export const EC_REPORT_NOT_AVAILABLE = 40405;

/** 商机不存在 */
export const EC_OPPORTUNITY_NOT_FOUND = 40403;

/** 参数无效 */
export const EC_INVALID_PARAMS = 40000;

/** 免费额度已用完 */
export const EC_FREE_LIMIT_REACHED = 41001;

/** 需付费额度 */
export const EC_PAID_QUOTA_REQUIRED = 41002;

/** 反馈操作数过多 */
export const EC_TOO_MANY_ACTIONS = 40004;

/** 反馈无有效操作 */
export const EC_NO_VALID_ACTIONS = 40005;

/** 会话不存在 */
export const EC_SESSION_REQUIRED = 40002;

// ── 分页限制常量（Pagination Limits）───────────────────────────────────────────

/** 通用 API 分页默认大小 */
export const DEFAULT_PAGE_LIMIT = 20;

/** 通用 API 分页最大条数（订单、解锁记录等） */
export const MAX_PAGE_LIMIT = 100;

/** Chat 消息列表默认条数 */
export const CHAT_MESSAGES_DEFAULT_LIMIT = 100;

/** Chat 消息列表最大条数 */
export const CHAT_MESSAGES_MAX_LIMIT = 500;

/** Chat 历史会话默认条数 */
export const CHAT_HISTORY_DEFAULT_LIMIT = 20;

/** Chat 历史会话最大条数 */
export const CHAT_HISTORY_MAX_LIMIT = 50;

/**
 * 将 query 参数中的 limit 归一化为合法数值。
 * 统一替代分散在多个路由中的 `Math.min(MAX, Math.max(1, Number(...) || DEFAULT))` 模式。
 */
export function clampLimit(raw: string | null, defaultVal: number, maxVal: number): number {
  return Math.min(maxVal, Math.max(1, Number(raw) || defaultVal));
}
