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

/** 存量弱哈希账号已停止密码校验，须先通过"忘记密码"重置后登录（403 语义，避开 401 刷新重试路径） */
export const EC_PASSWORD_RESET_REQUIRED = 40043;

/** 无权限 / 越权（Forbidden / ownership mismatch） */
export const EC_FORBIDDEN = 40003;

/** 资源不存在（Not found：公告/用户/会话/学习资料/供应商/线索） */
export const EC_NOT_FOUND = 40044;

/** 服务器内部错误（Internal server error） */
export const EC_INTERNAL_ERROR = 50000;

/** 验证码无效 / 已过期（Invalid verification code） */
export const EC_INVALID_CODE = 40007;

/** 密码错误 / 账号状态异常（Account issue） */
export const EC_ACCOUNT_ISSUE = 40013;

/** 手机号格式/绑定问题（Phone binding issue） */
export const EC_PHONE_ISSUE = 40011;

/** 邮箱格式/绑定问题（Email binding issue） */
export const EC_EMAIL_ISSUE = 40014;

/** 已注册 / 重复操作（Duplicate operation） */
export const EC_DUPLICATE = 40008;

/** VIP 专属功能（VIP-only feature） */
export const EC_VIP_ONLY = 40041;

/** 公告不在用户订阅的行业范围内（行业墙，2026-09-29「8,800元/行业」口径） */
export const EC_OUT_OF_CATEGORY = 40045;

/** 翻译服务不可用（Translation service unavailable） */
export const EC_TRANSLATION_UNAVAILABLE = 50002;

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
export const EC_TRAINING_PARTICIPANTS_COUNT_MISMATCH = 40023;

/** 课程不存在或已下架 */
export const EC_TRAINING_COURSE_NOT_FOUND = 40030;

/** 课程价格配置异常 */
export const EC_TRAINING_COURSE_PRICE_INVALID = 40032;

/** 培训支付渠道暂不可用 */
export const EC_TRAINING_PAYMENT_UNAVAILABLE = 40034;

/** 所选期次不存在 */
export const EC_TRAINING_SCHEDULE_NOT_FOUND = 40033;

/** 期次名额已满 */
export const EC_TRAINING_SCHEDULE_CAPACITY_EXCEEDED = 40035;

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

/** API Key 无效或已 revoked */
export const EC_API_KEY_INVALID = 40101;

/** API Key 已过期 */
export const EC_API_KEY_EXPIRED = 40102;

/** API Key 已暂停 */
export const EC_API_KEY_SUSPENDED = 40302;

/** API 每日配额已用完 */
export const EC_API_QUOTA_EXCEEDED = 42901;

// ── 业务规则细分码（统一用户友好提示层 Phase A，2026-10-12）─────────────────────
// 规约：把此前塌缩到通用 EC_INVALID_PARAMS(40000)/EC_INVALID_REQUEST(40022) 的「状态/规则冲突」
//       逐条拆成独立稳定码，前端据 code→i18n 键精确翻译；纯字段级/格式级校验仍复用 EC_INVALID_REQUEST。

/** 认领：目标供应商不存在 */
export const EC_CLAIM_SUPPLIER_NOT_FOUND = 40046;
/** 认领：已认证通过，无需重复提交 */
export const EC_CLAIM_ALREADY_APPROVED = 40047;
/** 认领：当前账号已绑定该主体，无需重复认领 */
export const EC_CLAIM_SELF_BOUND = 40049;
/** 认领：已被其他账户认领（排他终态，重试无用） */
export const EC_CLAIM_BOUND_BY_OTHER = 40050;
/** 认领：已有认领申请正在处理中 */
export const EC_CLAIM_PENDING = 40051;
/** 企业绑定：当前账号尚未绑定企业 */
export const EC_ENTERPRISE_NOT_BOUND = 40052;
/** 企业绑定：目标公司已被其他账户认领，无法绑定 */
export const EC_ENTERPRISE_CLAIMED_BY_OTHER = 40053;
/** 词组库：词组数量已达上限 */
export const EC_KEYWORD_GROUP_LIMIT = 40054;
/** 词组库：已存在同名词组 */
export const EC_KEYWORD_GROUP_DUPLICATE = 40055;
/** 词组库：词组名或关键词不合法 */
export const EC_KEYWORD_GROUP_NAME_INVALID = 40056;
/** 诊断：答题内容不完整 */
export const EC_DIAGNOSIS_ANSWERS_INCOMPLETE = 40059;
/** 诊断：指定的企业主体不存在 */
export const EC_DIAGNOSIS_ENTITY_NOT_FOUND = 40060;
/** 资源库：容量已满 */
export const EC_POOL_FULL = 40061;
/** 资源库：供应商不存在或未通过认证 */
export const EC_POOL_SUPPLIER_NOT_VERIFIED = 40062;
/** 资源库：该供应商已在资源库中 */
export const EC_POOL_SUPPLIER_DUPLICATE = 40063;
/** 客服会话：会话记录不存在（区别于未登录） */
export const EC_CHAT_SESSION_MISSING = 40057;
/** 文件代理：缺少/非法 url 参数 */
export const EC_PROXY_URL_MISSING = 40058;
/** 升级预览：未指定目标套餐 */
export const EC_UPGRADE_PLAN_REQUIRED = 40064;
/** 商机列表：缺少 code_id/industry_id 查询参数 */
export const EC_OPPORTUNITY_CODE_REQUIRED = 40065;
/** 线索跟进：缺少线索 ID 或内容 */
export const EC_LEAD_FIELDS_REQUIRED = 40066;
/** 跟进状态非法（不在白名单） */
export const EC_LEAD_STATUS_INVALID = 40067;
/** 词组库：名称为官方词组保留名 */
export const EC_KEYWORD_GROUP_NAME_RESERVED = 40068;

// ── 支付细分码（承接原 mapPaymentError 全部分支语义，按码 i18n 化）──────────────
/** 支付：套餐方案不存在 */
export const EC_PAYMENT_PLAN_NOT_FOUND = 40407;
/** 支付：学习资料不存在或已下架 */
export const EC_PAYMENT_MATERIAL_NOT_FOUND = 40408;
/** 支付：打包套餐不存在或已下架 */
export const EC_PAYMENT_BUNDLE_NOT_FOUND = 40409;
/** 支付：缺少用户与套餐信息，需先登录 */
export const EC_PAYMENT_USER_PLAN_REQUIRED = 40070;
/** 支付：套餐不可自助成交 */
export const EC_PAYMENT_PLAN_NOT_SELLABLE = 40071;
/** 支付：金额无效或与应付不符 */
export const EC_PAYMENT_AMOUNT_INVALID = 40072;
/** 支付：免费套餐无需支付 */
export const EC_PAYMENT_FREE_PLAN = 40073;
/** 支付：升级来源快照无效或已过期 */
export const EC_PAYMENT_UPGRADE_INVALID = 40074;
/** 支付：增值服务暂不支持在线下单 */
export const EC_PAYMENT_SERVICE_UNAVAILABLE = 40076;
/** 支付：该服务仅顾问对接，不支持自助下单 */
export const EC_PAYMENT_SERVICE_ADVISORY_ONLY = 40077;
/** 支付：签名验证失败 */
export const EC_PAYMENT_SIGN_VERIFY_FAILED = 40078;
/** 支付：会员购买必须选择行业大类 */
export const EC_PAYMENT_INDUSTRY_REQUIRED = 40079;
/** 支付：行业大类非法或已停用 */
export const EC_PAYMENT_INDUSTRY_INVALID = 40080;

// ── 认证/账号域专属码（auth 治本，2026-10-22）──────────────────────────────────
// 背景：auth 路由历史上直接手写裸数字（40030/40010/40029/40050-52/40060-62 等），
//       与他域 EC_ 常量撞值，导致 error-map 按码号取 i18n 时张冠李戴
//       （如「尚未绑定手机号」被解析成「课程不存在」）。统一迁入空闲 411xx 段并登记。

/** 尚未绑定手机号 */
export const EC_PHONE_NOT_BOUND = 41103;
/** 尚未绑定邮箱 */
export const EC_EMAIL_NOT_BOUND = 41104;
/** 已绑定手机号（须先解绑或换绑） */
export const EC_PHONE_ALREADY_BOUND = 41105;
/** 已绑定邮箱（须先解绑） */
export const EC_EMAIL_ALREADY_BOUND = 41106;
/** 手机号/邮箱已被其他用户绑定 */
export const EC_CONTACT_TAKEN_BY_OTHER = 41107;
/** 验证码尝试次数过多（须重新获取） */
export const EC_TOO_MANY_ATTEMPTS = 41108;
/** 短信服务未配置 */
export const EC_SMS_NOT_CONFIGURED = 41109;
/** 邮件服务未配置 */
export const EC_EMAIL_NOT_CONFIGURED = 41110;
/** 短信发送失败 */
export const EC_SMS_SEND_FAILED = 41111;
/** 邮件发送失败 */
export const EC_EMAIL_SEND_FAILED = 41112;
/** 缺少刷新令牌 */
export const EC_REFRESH_TOKEN_MISSING = 41113;
/** 刷新令牌无效 */
export const EC_REFRESH_TOKEN_INVALID = 41114;
/** 刷新令牌已过期 */
export const EC_REFRESH_TOKEN_EXPIRED = 41115;
/** 刷新令牌已失效（已撤销） */
export const EC_REFRESH_TOKEN_REVOKED = 41116;
/** 昵称不合法（长度或字符） */
export const EC_NICKNAME_INVALID = 41117;
/** 账号未通过审核或已停用 */
export const EC_ACCOUNT_DISABLED = 41118;

// ── 内容锁定 / 客服会话 / 限流（全域错误码治本，2026-10-22）──────────────────
// 同为“auth 手写裸数字撞他域”治理延伸：这些语义此前散用 40013/40901/42001 等裸数字，
// 或属未登记、或与他域 i18n 撞号，统一迁入唯一码。

/** 内容已锁定，需先解锁（公告/商机等） */
export const EC_CONTENT_LOCKED = 41201;
/** 客服会话已结束（不可再发消息） */
export const EC_CHAT_SESSION_CLOSED = 41203;
/** 客服会话评价条件不满足（未结束或已评价） */
export const EC_CHAT_RATE_INVALID = 41204;
/** 请求过于频繁（限流拦截） */
export const EC_RATE_LIMITED = 42001;

// ── AI 摘要 / 翻译 / 邀请码专属码（service 层错误码治本，2026-10-27）──────────────
// 背景：ai-summary/errors.ts、translation-flow.ts、auth-register.ts 此前直接手写裸数字
//       （40001/40010/50001/40031/40006 等），与登录态/支付/公告等他域 EC_ 常量撞值，
//       导致前端按码取 i18n 张冠李戴（如「请先配置 LLM Key」弹成「请先登录」）。
//       统一迁入空闲 413xx / 513xx 段并登记（复用既有 aiErr* 文案键）。

/** AI：用户未配置 LLM API Key */
export const EC_AI_NOT_CONFIGURED = 41301;
/** AI：LLM 返回格式异常 */
export const EC_AI_BAD_FORMAT = 41302;
/** AI：缺少企业画像资料，无法评分 */
export const EC_SUPPLIER_PROFILE_REQUIRED = 41303;
/** AI：LLM 调用失败（服务端） */
export const EC_AI_CALL_FAILED = 51301;
/** 注册：邀请码无效 */
export const EC_INVITE_CODE_INVALID = 41119;

// ── 端点废弃码（Response.json 裸码字面量治本，2026-10-27）─────────────────
/** 该端点已废弃，请使用子路由 */
export const EC_ENDPOINT_RETIRED = 41010;

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
