/**
 * 统一用户友好错误提示层
 * Unified User-Friendly Error Mapping Layer
 *
 * @module core/http/error-map
 * @description 全站唯一错误出口：把后端 ApiError（code/status/detail）、流式回传的
 *              稳定令牌字符串、以及网络层异常，按「稳定码优先 → 状态兜底 → 令牌桥接 →
 *              网络/通用兜底」的顺序翻译为 i18n 本地化文案。
 *              取代此前并行的 mapPaymentError / gateErrorToken / 组件内联 friendlyError。
 *
 *              消费方均为 hook/component，通过参数注入 useLocale 的 t，保持本模块纯函数、
 *              无 React 依赖（可在无 t 的极窄场景直接取 message 兜底）。
 */
import { ApiError } from "./api-client";
import {
  // 认证 / 权限
  EC_USER_REQUIRED, EC_AUTH_REQUIRED, EC_PASSWORD_RESET_REQUIRED,
  EC_FORBIDDEN, EC_ACCESS_FORBIDDEN,
  EC_INVALID_CODE, EC_ACCOUNT_ISSUE, EC_PHONE_ISSUE, EC_EMAIL_ISSUE, EC_DUPLICATE,
  // 权益门控
  EC_VIP_ONLY, EC_OUT_OF_CATEGORY,
  // 额度
  EC_FREE_LIMIT_REACHED, EC_PAID_QUOTA_REQUIRED, EC_API_QUOTA_EXCEEDED,
  // 资源不存在
  EC_NOT_FOUND, EC_NOTICE_NOT_FOUND, EC_NOTICE_NOT_FOUND_404, EC_OPPORTUNITY_NOT_FOUND, EC_REPORT_NOT_AVAILABLE,
  // 系统
  EC_INTERNAL_ERROR, EC_TRANSLATION_UNAVAILABLE,
  // 培训 / 报名
  EC_TRAINING_ORDER_NOT_FOUND, EC_TRAINING_ORDER_FORBIDDEN, EC_TRAINING_ORDER_NOT_PAID,
  EC_TRAINING_PARTICIPANTS_INVALID, EC_TRAINING_PARTICIPANTS_COUNT_MISMATCH,
  EC_TRAINING_COURSE_NOT_FOUND, EC_TRAINING_COURSE_PRICE_INVALID, EC_TRAINING_PAYMENT_UNAVAILABLE,
  EC_TRAINING_SCHEDULE_NOT_FOUND, EC_TRAINING_SCHEDULE_CAPACITY_EXCEEDED,
  // API Key
  EC_API_KEY_INVALID, EC_API_KEY_EXPIRED, EC_API_KEY_SUSPENDED,
  // 业务规则细分码（Phase A）
  EC_CLAIM_SUPPLIER_NOT_FOUND, EC_CLAIM_SELF_BOUND, EC_CLAIM_BOUND_BY_OTHER, EC_CLAIM_PENDING,
  EC_ENTERPRISE_NOT_BOUND, EC_ENTERPRISE_CLAIMED_BY_OTHER,
  EC_KEYWORD_GROUP_LIMIT, EC_KEYWORD_GROUP_DUPLICATE, EC_KEYWORD_GROUP_NAME_INVALID,
  EC_DIAGNOSIS_ANSWERS_INCOMPLETE, EC_DIAGNOSIS_ENTITY_NOT_FOUND,
  EC_POOL_FULL, EC_POOL_SUPPLIER_NOT_VERIFIED, EC_POOL_SUPPLIER_DUPLICATE,
  EC_CHAT_SESSION_MISSING, EC_PROXY_URL_MISSING, EC_UPGRADE_PLAN_REQUIRED,
  EC_OPPORTUNITY_CODE_REQUIRED, EC_LEAD_FIELDS_REQUIRED, EC_LEAD_STATUS_INVALID,
  // 支付细分码（Phase A）
  EC_PAYMENT_PROVIDER_UNAVAILABLE, EC_PAYMENT_QR_CODE_MISSING, EC_PAYMENT_ORDER_NOT_FOUND,
  EC_PAYMENT_PLAN_NOT_FOUND, EC_PAYMENT_MATERIAL_NOT_FOUND, EC_PAYMENT_BUNDLE_NOT_FOUND,
  EC_PAYMENT_USER_PLAN_REQUIRED, EC_PAYMENT_PLAN_NOT_SELLABLE, EC_PAYMENT_AMOUNT_INVALID,
  EC_PAYMENT_FREE_PLAN, EC_PAYMENT_UPGRADE_INVALID, EC_PAYMENT_SINGLE_FIRST_PURCHASE,
  EC_PAYMENT_SERVICE_UNAVAILABLE, EC_PAYMENT_SERVICE_ADVISORY_ONLY, EC_PAYMENT_SIGN_VERIFY_FAILED,
  // 认证/账号域专属码（auth 治本）
  EC_PHONE_NOT_BOUND, EC_EMAIL_NOT_BOUND, EC_PHONE_ALREADY_BOUND, EC_EMAIL_ALREADY_BOUND,
  EC_CONTACT_TAKEN_BY_OTHER, EC_TOO_MANY_ATTEMPTS, EC_SMS_NOT_CONFIGURED, EC_EMAIL_NOT_CONFIGURED,
  EC_SMS_SEND_FAILED, EC_EMAIL_SEND_FAILED, EC_REFRESH_TOKEN_MISSING, EC_REFRESH_TOKEN_INVALID,
  EC_REFRESH_TOKEN_EXPIRED, EC_REFRESH_TOKEN_REVOKED, EC_NICKNAME_INVALID, EC_ACCOUNT_DISABLED,
  // 内容锁定 / 客服会话 / 限流（全域治本）
  EC_CONTENT_LOCKED, EC_CHAT_SESSION_CLOSED, EC_CHAT_RATE_INVALID, EC_RATE_LIMITED,
  // 推荐反馈批量校验码（全域治本）
  EC_SESSION_REQUIRED, EC_TOO_MANY_ACTIONS, EC_NO_VALID_ACTIONS,
  // AI 摘要 / 邀请码专属码（service 层错误码治本）
  EC_AI_NOT_CONFIGURED, EC_AI_BAD_FORMAT, EC_SUPPLIER_PROFILE_REQUIRED, EC_AI_CALL_FAILED, EC_INVITE_CODE_INVALID,
} from "@/shared/constants/api";

/** 注入式翻译函数（与 useLocale 的 t 对齐；params 预留插值） */
export type Translator = (key: string, params?: Record<string, string | number>) => string;

/** 错误大类，供组件按语义分支渲染（如 VIP/行业墙升级引导卡） */
export type ErrorKind =
  | "system" | "network" | "auth" | "forbidden" | "vipGate" | "industryWall"
  | "quota" | "payment" | "business" | "ai" | "unknown";

/** 结构化分类结果 */
export interface ErrorClassification {
  kind: ErrorKind;
  /** i18n 键；null 表示未登记（回落 message / 通用兜底） */
  key: string | null;
  code?: number;
  status?: number;
  /** VIP 档位闸门所需等级（kind==='vipGate' 时有值） */
  requiredRank?: number;
  /** 原始 message（后端中文/技术串），供回落与日志 */
  message: string;
}

interface CodeRule { kind: ErrorKind; key: string; }

/** 稳定码 → 分类 + i18n 键（覆盖全站已登记业务/权限/支付语义） */
const CODE_MAP: Record<number, CodeRule> = {
  // 认证 / 权限
  [EC_USER_REQUIRED]: { kind: "auth", key: "errLoginRequired" },
  [EC_AUTH_REQUIRED]: { kind: "auth", key: "errLoginRequired" },
  [EC_PASSWORD_RESET_REQUIRED]: { kind: "auth", key: "errPasswordResetRequired" },
  [EC_FORBIDDEN]: { kind: "forbidden", key: "errForbidden" },
  [EC_ACCESS_FORBIDDEN]: { kind: "forbidden", key: "errForbidden" },
  [EC_INVALID_CODE]: { kind: "auth", key: "errInvalidCode" },
  [EC_ACCOUNT_ISSUE]: { kind: "auth", key: "errAccountIssue" },
  [EC_PHONE_ISSUE]: { kind: "business", key: "errPhoneIssue" },
  [EC_EMAIL_ISSUE]: { kind: "business", key: "errEmailIssue" },
  [EC_DUPLICATE]: { kind: "business", key: "errDuplicate" },
  // 权益门控
  [EC_VIP_ONLY]: { kind: "vipGate", key: "errVipFeatureOnly" },
  [EC_OUT_OF_CATEGORY]: { kind: "industryWall", key: "errOutOfCategory" },
  // 额度
  [EC_FREE_LIMIT_REACHED]: { kind: "quota", key: "errFreeLimitReached" },
  [EC_PAID_QUOTA_REQUIRED]: { kind: "quota", key: "errPaidQuotaRequired" },
  [EC_API_QUOTA_EXCEEDED]: { kind: "quota", key: "errApiQuotaExceeded" },
  // 资源不存在
  [EC_NOT_FOUND]: { kind: "business", key: "errNotFound" },
  [EC_NOTICE_NOT_FOUND]: { kind: "business", key: "errNoticeNotFound" },
  [EC_NOTICE_NOT_FOUND_404]: { kind: "business", key: "errNoticeNotFound" },
  [EC_OPPORTUNITY_NOT_FOUND]: { kind: "business", key: "errOpportunityNotFound" },
  [EC_REPORT_NOT_AVAILABLE]: { kind: "business", key: "errReportNotAvailable" },
  // 系统
  [EC_INTERNAL_ERROR]: { kind: "system", key: "errSystemBusy" },
  [EC_TRANSLATION_UNAVAILABLE]: { kind: "system", key: "errServiceUnavailable" },
  // 培训 / 报名
  [EC_TRAINING_ORDER_NOT_FOUND]: { kind: "business", key: "errTrainingOrderNotFound" },
  [EC_TRAINING_ORDER_FORBIDDEN]: { kind: "forbidden", key: "errTrainingOrderForbidden" },
  [EC_TRAINING_ORDER_NOT_PAID]: { kind: "business", key: "errTrainingOrderNotPaid" },
  [EC_TRAINING_PARTICIPANTS_INVALID]: { kind: "business", key: "errTrainingParticipantsInvalid" },
  [EC_TRAINING_PARTICIPANTS_COUNT_MISMATCH]: { kind: "business", key: "errTrainingParticipantsCountMismatch" },
  [EC_TRAINING_COURSE_NOT_FOUND]: { kind: "business", key: "errTrainingCourseNotFound" },
  [EC_TRAINING_COURSE_PRICE_INVALID]: { kind: "business", key: "errTrainingCoursePriceInvalid" },
  [EC_TRAINING_PAYMENT_UNAVAILABLE]: { kind: "payment", key: "errTrainingPaymentUnavailable" },
  [EC_TRAINING_SCHEDULE_NOT_FOUND]: { kind: "business", key: "errTrainingScheduleNotFound" },
  [EC_TRAINING_SCHEDULE_CAPACITY_EXCEEDED]: { kind: "business", key: "errTrainingScheduleCapacityExceeded" },
  // API Key
  [EC_API_KEY_INVALID]: { kind: "auth", key: "errApiKeyInvalid" },
  [EC_API_KEY_EXPIRED]: { kind: "auth", key: "errApiKeyExpired" },
  [EC_API_KEY_SUSPENDED]: { kind: "auth", key: "errApiKeySuspended" },
  // 业务规则细分（Phase A）
  [EC_CLAIM_SUPPLIER_NOT_FOUND]: { kind: "business", key: "errClaimSupplierNotFound" },
  [EC_CLAIM_SELF_BOUND]: { kind: "business", key: "errClaimSelfBound" },
  [EC_CLAIM_BOUND_BY_OTHER]: { kind: "business", key: "errClaimBoundByOther" },
  [EC_CLAIM_PENDING]: { kind: "business", key: "errClaimPending" },
  [EC_ENTERPRISE_NOT_BOUND]: { kind: "business", key: "errEnterpriseNotBound" },
  [EC_ENTERPRISE_CLAIMED_BY_OTHER]: { kind: "business", key: "errEnterpriseClaimedByOther" },
  [EC_KEYWORD_GROUP_LIMIT]: { kind: "business", key: "errKeywordGroupLimit" },
  [EC_KEYWORD_GROUP_DUPLICATE]: { kind: "business", key: "errKeywordGroupDuplicate" },
  [EC_KEYWORD_GROUP_NAME_INVALID]: { kind: "business", key: "errKeywordGroupNameInvalid" },
  [EC_DIAGNOSIS_ANSWERS_INCOMPLETE]: { kind: "business", key: "errDiagnosisAnswersIncomplete" },
  [EC_DIAGNOSIS_ENTITY_NOT_FOUND]: { kind: "business", key: "errDiagnosisEntityNotFound" },
  [EC_POOL_FULL]: { kind: "business", key: "errPoolFull" },
  [EC_POOL_SUPPLIER_NOT_VERIFIED]: { kind: "business", key: "errPoolSupplierNotVerified" },
  [EC_POOL_SUPPLIER_DUPLICATE]: { kind: "business", key: "errPoolSupplierDuplicate" },
  [EC_CHAT_SESSION_MISSING]: { kind: "business", key: "errChatSessionMissing" },
  [EC_PROXY_URL_MISSING]: { kind: "business", key: "errProxyUrlMissing" },
  [EC_UPGRADE_PLAN_REQUIRED]: { kind: "business", key: "errUpgradePlanRequired" },
  [EC_OPPORTUNITY_CODE_REQUIRED]: { kind: "business", key: "errOpportunityCodeRequired" },
  [EC_LEAD_FIELDS_REQUIRED]: { kind: "business", key: "errLeadFieldsRequired" },
  [EC_LEAD_STATUS_INVALID]: { kind: "business", key: "errLeadStatusInvalid" },
  // 支付细分（Phase A）
  [EC_PAYMENT_PROVIDER_UNAVAILABLE]: { kind: "payment", key: "payErrProviderUnavailable" },
  [EC_PAYMENT_QR_CODE_MISSING]: { kind: "payment", key: "payErrQrMissing" },
  [EC_PAYMENT_ORDER_NOT_FOUND]: { kind: "payment", key: "payErrOrderNotFound" },
  [EC_PAYMENT_PLAN_NOT_FOUND]: { kind: "payment", key: "payErrPlanNotFound" },
  [EC_PAYMENT_MATERIAL_NOT_FOUND]: { kind: "payment", key: "payErrMaterialNotFound" },
  [EC_PAYMENT_BUNDLE_NOT_FOUND]: { kind: "payment", key: "payErrBundleNotFound" },
  [EC_PAYMENT_USER_PLAN_REQUIRED]: { kind: "payment", key: "payErrUserPlanRequired" },
  [EC_PAYMENT_PLAN_NOT_SELLABLE]: { kind: "payment", key: "payErrPlanNotSellable" },
  [EC_PAYMENT_AMOUNT_INVALID]: { kind: "payment", key: "payErrAmountInvalid" },
  [EC_PAYMENT_FREE_PLAN]: { kind: "payment", key: "payErrFreePlan" },
  [EC_PAYMENT_UPGRADE_INVALID]: { kind: "payment", key: "payErrUpgradeInvalid" },
  [EC_PAYMENT_SINGLE_FIRST_PURCHASE]: { kind: "payment", key: "payErrSingleFirstPurchase" },
  [EC_PAYMENT_SERVICE_UNAVAILABLE]: { kind: "payment", key: "payErrServiceUnavailable" },
  [EC_PAYMENT_SERVICE_ADVISORY_ONLY]: { kind: "payment", key: "payErrServiceAdvisoryOnly" },
  [EC_PAYMENT_SIGN_VERIFY_FAILED]: { kind: "payment", key: "payErrSignVerifyFailed" },
  // 认证/账号域专属码（auth 治本）
  [EC_PHONE_NOT_BOUND]: { kind: "business", key: "errPhoneNotBound" },
  [EC_EMAIL_NOT_BOUND]: { kind: "business", key: "errEmailNotBound" },
  [EC_PHONE_ALREADY_BOUND]: { kind: "business", key: "errPhoneAlreadyBound" },
  [EC_EMAIL_ALREADY_BOUND]: { kind: "business", key: "errEmailAlreadyBound" },
  [EC_CONTACT_TAKEN_BY_OTHER]: { kind: "business", key: "errContactTakenByOther" },
  [EC_TOO_MANY_ATTEMPTS]: { kind: "business", key: "errTooManyAttempts" },
  [EC_SMS_NOT_CONFIGURED]: { kind: "system", key: "errSmsNotConfigured" },
  [EC_EMAIL_NOT_CONFIGURED]: { kind: "system", key: "errEmailNotConfigured" },
  [EC_SMS_SEND_FAILED]: { kind: "system", key: "errSmsSendFailed" },
  [EC_EMAIL_SEND_FAILED]: { kind: "system", key: "errEmailSendFailed" },
  [EC_REFRESH_TOKEN_MISSING]: { kind: "auth", key: "errLoginRequired" },
  [EC_REFRESH_TOKEN_INVALID]: { kind: "auth", key: "errSessionExpired" },
  [EC_REFRESH_TOKEN_EXPIRED]: { kind: "auth", key: "errSessionExpired" },
  [EC_REFRESH_TOKEN_REVOKED]: { kind: "auth", key: "errSessionExpired" },
  [EC_NICKNAME_INVALID]: { kind: "business", key: "errNicknameInvalid" },
  [EC_ACCOUNT_DISABLED]: { kind: "forbidden", key: "errAccountDisabled" },
  // 内容锁定 / 客服会话 / 限流（全域治本）
  [EC_CONTENT_LOCKED]: { kind: "forbidden", key: "errUnlockRequired" },
  [EC_CHAT_SESSION_CLOSED]: { kind: "business", key: "errChatSessionClosed" },
  [EC_CHAT_RATE_INVALID]: { kind: "business", key: "errChatNotRatable" },
  [EC_RATE_LIMITED]: { kind: "system", key: "errRateLimited" },
  // 推荐反馈批量校验（全域治本）
  [EC_SESSION_REQUIRED]: { kind: "business", key: "errSessionRequired" },
  [EC_TOO_MANY_ACTIONS]: { kind: "business", key: "errTooManyActions" },
  [EC_NO_VALID_ACTIONS]: { kind: "business", key: "errNoValidActions" },
  // AI 摘要 / 邀请码（service 层治本；复用既有 aiErr* 文案键）
  [EC_AI_NOT_CONFIGURED]: { kind: "ai", key: "aiErrNotConfigured" },
  [EC_AI_BAD_FORMAT]: { kind: "ai", key: "aiErrBadFormat" },
  [EC_SUPPLIER_PROFILE_REQUIRED]: { kind: "ai", key: "aiSupplierProfileRequired" },
  [EC_AI_CALL_FAILED]: { kind: "ai", key: "aiErrCallFailed" },
  [EC_INVITE_CODE_INVALID]: { kind: "business", key: "errInviteCodeInvalid" },
};

/** HTTP 状态兜底（无稳定码命中时） */
const STATUS_MAP: Record<number, CodeRule> = {
  401: { kind: "auth", key: "errLoginRequired" },
  403: { kind: "forbidden", key: "errForbidden" },
  404: { kind: "business", key: "errNotFound" },
  429: { kind: "system", key: "errRateLimited" },
  500: { kind: "system", key: "errSystemBusy" },
  502: { kind: "system", key: "errServiceUnavailable" },
  503: { kind: "system", key: "errServiceUnavailable" },
  504: { kind: "system", key: "errTimeout" },
};

/** AI/遗留令牌桥接：稳定 ASCII 令牌（大小写敏感）→ 分类 + 键。顺序即优先级。 */
const TOKEN_RULES: Array<{ tokens: string[]; kind: ErrorKind; key: string }> = [
  // BYOK 凭证类须先于登录态判断（LLM_HTTP_401 含 "401" 子串，否则会误报登录过期）
  { tokens: ["LLM_HTTP_401", "LLM_HTTP_402", "LLM_HTTP_403", "LLM_KEY_REJECTED"], kind: "ai", key: "aiErrKeyRejected" },
  { tokens: ["LLM_NOT_CONFIGURED", "请先配置 LLM", "未配置 LLM", "配置 AI 模型"], kind: "ai", key: "aiErrNotConfigured" },
  { tokens: ["SUPPLIER_PROFILE_REQUIRED"], kind: "ai", key: "aiSupplierProfileRequired" },
  { tokens: ["LLM_HTTP_429", "rate", "频繁"], kind: "ai", key: "aiErrRateLimited" },
  { tokens: ["LLM_BAD_JSON", "LLM_BAD_SHAPE", "LLM_EMPTY", "LLM 返回格式异常"], kind: "ai", key: "aiErrBadFormat" },
  { tokens: ["LLM_HTTP_5", "LLM_HTTP_4", "LLM 调用失败", "timeout", "network", "offline"], kind: "ai", key: "aiErrCallFailed" },
  { tokens: ["NOTICE_NOT_FOUND"], kind: "business", key: "errNoticeNotFound" },
  // 锁定 / 未解锁（core_locked detail 之外的令牌兜底）
  { tokens: ["core_locked", "请先解锁", "公告已锁定"], kind: "forbidden", key: "errUnlockRequired" },
  // 登录态（精确 HTTP 401，不做裸 "401" 子串）
  { tokens: ["HTTP 401", "请先登录", "Unauthorized"], kind: "auth", key: "aiErrLoginRequired" },
  { tokens: ["rate limit", "too many requests"], kind: "ai", key: "aiErrRateLimited" },
];

/** 消息是否含 CJK（含则视为人类可读文案，可直接回落展示） */
function hasHumanText(msg: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(msg);
}

/** 按稳定令牌桥接（供无码/非 ApiError 输入，尤其 AI 流式回传的原始字符串） */
function matchToken(message: string): { kind: ErrorKind; key: string } | null {
  for (const rule of TOKEN_RULES) {
    if (rule.tokens.some((t) => message.includes(t))) return { kind: rule.kind, key: rule.key };
  }
  return null;
}

/**
 * 将任意来源的错误归一为结构化分类。
 * 优先稳定码 → 令牌桥接 → 403 锁定 detail → HTTP 状态 → 网络层 → unknown。
 */
export function classifyApiError(err: unknown): ErrorClassification {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : String(err ?? "");
  const isApi = err instanceof ApiError;
  const code = isApi ? err.code : undefined;
  const status = isApi ? err.status : undefined;
  const detail = isApi ? (err.detail as Record<string, unknown> | undefined) : undefined;

  // 0) 未解锁闸门优先：部分路由复用 40013（与 EC_ACCOUNT_ISSUE 同值）携 core_locked detail，
  //    必须在按码映射前拦截，否则锁定态会被误判成“账号异常”。
  if (status === 403 && detail && (detail.core_locked === true || detail.locked === true)) {
    return { kind: "forbidden", key: "errUnlockRequired", code, status, message };
  }

  // 1) 已知稳定码
  if (typeof code === "number" && CODE_MAP[code]) {
    const rule = CODE_MAP[code];
    let requiredRank: number | undefined;
    if (rule.kind === "vipGate") {
      const rr = Number((detail as Record<string, unknown> | undefined)?.required_rank ?? (detail as Record<string, unknown> | undefined)?.rank ?? 0);
      requiredRank = Number.isFinite(rr) && rr > 0 ? rr : undefined;
    }
    return { kind: rule.kind, key: rule.key, code, status, requiredRank, message };
  }

  // 2) 稳定令牌桥接（AI/遗留；无码或非 ApiError 也可命中）
  const token = matchToken(message);
  if (token) return { kind: token.kind, key: token.key, code, status, message };

  // 4) HTTP 状态兜底
  if (typeof status === "number" && STATUS_MAP[status]) {
    const rule = STATUS_MAP[status];
    return { kind: rule.kind, key: rule.key, code, status, message };
  }

  // 5) 网络层失败（fetch 抛出的 TypeError，非 ApiError）
  if (!isApi && (err instanceof TypeError || /failed to fetch|networkerror|network request failed|econnrefused|econnreset|timeout/i.test(message))) {
    return { kind: "network", key: "errNetworkOffline", code, status, message };
  }

  // 6) 未知（交回落逻辑处理）
  return { kind: "unknown", key: null, code, status, message };
}

/**
 * 将错误翻译为本地化用户文案。
 * @param err ApiError / Error / 流式回传的原始字符串
 * @param t 注入的翻译函数（useLocale 的 t）；缺省时直接返回可展示的原始文案
 */
export function mapApiError(err: unknown, t?: Translator): string {
  const c = classifyApiError(err);
  if (c.key && t) {
    const localized = t(c.key);
    if (localized) return localized;
  }
  // 键缺失或无 t：人类可读文案（后端中文）直接展示；纯技术串走通用兜底，不外泄堆栈。
  if (c.message && hasHumanText(c.message)) return c.message;
  return t ? t("errSystemBusy") : "请求失败，请稍后重试";
}

/**
 * 从已分类结果渲染本地化文案（供预先 classify 并存入状态的 hook/组件复用，避免重复抛原始错误）。
 */
export function resolveErrorText(c: ErrorClassification | null | undefined, t: Translator): string {
  if (!c) return "";
  if (c.key) {
    const localized = t(c.key);
    if (localized) return localized;
  }
  if (c.message && hasHumanText(c.message)) return c.message;
  return t("errSystemBusy");
}
