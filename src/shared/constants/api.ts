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
