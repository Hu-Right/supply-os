/**
 * API 错误码目录（单一事实源，ADR-0021）
 * API Error Catalog — the single source of truth
 *
 * @module shared/errors/catalog
 * @description 全部业务错误码的唯一登记处：每码一条 {code, type, status, kind, i18nKey}。
 *              - `type`（snake_case 稳定字符串）是错误标识主键，前端/测试/文档以它为准；
 *              - `status` 按 ADR-0021 §2.1 判据表定死，routeError 调用点的 HTTP 状态必须与此一致；
 *              - `i18nKey` 为 errors.json（7 语）的键名；
 *              - `deprecatedAliasOf` 标记同义合并：本码已废弃，新代码必须用指向码；
 *              - 新增错误必须先在此登记才允许抛出（scripts/gates/check-error-codes.mjs 驻守）。
 *              error-map（core/http）与 errors.json 均以本目录为准，禁止脱离登记手写映射。
 */
import {
  EC_INVALID_PARAMS, EC_INVALID_REQUEST, EC_NOT_FOUND, EC_INTERNAL_ERROR, EC_RATE_LIMITED,
  EC_ENDPOINT_RETIRED, EC_TOO_MANY_ACTIONS, EC_NO_VALID_ACTIONS, EC_PROXY_URL_MISSING,
  EC_PROXY_RESPONSE_TOO_LARGE, EC_TRANSLATION_UNAVAILABLE, EC_INVALID_CODE, EC_DUPLICATE,
  EC_AUTH_REQUIRED, EC_USER_REQUIRED, EC_SESSION_REQUIRED, EC_ACCOUNT_ISSUE,
  EC_PASSWORD_RESET_REQUIRED, EC_ACCOUNT_DISABLED, EC_NICKNAME_INVALID, EC_INVITE_CODE_INVALID,
  EC_TOO_MANY_ATTEMPTS, EC_API_KEY_INVALID, EC_API_KEY_EXPIRED, EC_API_KEY_SUSPENDED,
  EC_REFRESH_TOKEN_MISSING, EC_REFRESH_TOKEN_INVALID, EC_REFRESH_TOKEN_EXPIRED,
  EC_REFRESH_TOKEN_REVOKED, EC_PHONE_ISSUE, EC_EMAIL_ISSUE, EC_PHONE_NOT_BOUND,
  EC_EMAIL_NOT_BOUND, EC_PHONE_ALREADY_BOUND, EC_EMAIL_ALREADY_BOUND, EC_CONTACT_TAKEN_BY_OTHER,
  EC_SMS_NOT_CONFIGURED, EC_EMAIL_NOT_CONFIGURED, EC_SMS_SEND_FAILED, EC_EMAIL_SEND_FAILED,
  EC_VIP_ONLY, EC_OUT_OF_CATEGORY, EC_CONTENT_LOCKED, EC_FREE_LIMIT_REACHED,
  EC_PAID_QUOTA_REQUIRED, EC_API_QUOTA_EXCEEDED, EC_UPGRADE_PLAN_REQUIRED,
  EC_PAYMENT_PROVIDER_UNAVAILABLE, EC_PAYMENT_QR_CODE_MISSING, EC_PAYMENT_ORDER_NOT_FOUND,
  EC_PAYMENT_PLAN_NOT_FOUND, EC_PAYMENT_MATERIAL_NOT_FOUND, EC_PAYMENT_BUNDLE_NOT_FOUND,
  EC_PAYMENT_USER_PLAN_REQUIRED, EC_PAYMENT_PLAN_NOT_SELLABLE, EC_PAYMENT_AMOUNT_INVALID,
  EC_PAYMENT_FREE_PLAN, EC_PAYMENT_UPGRADE_INVALID, EC_PAYMENT_SERVICE_UNAVAILABLE,
  EC_PAYMENT_SERVICE_ADVISORY_ONLY, EC_PAYMENT_SIGN_VERIFY_FAILED, EC_PAYMENT_INDUSTRY_REQUIRED,
  EC_PAYMENT_INDUSTRY_INVALID, EC_ACCESS_FORBIDDEN, EC_FORBIDDEN, EC_TRAINING_ORDER_NOT_FOUND,
  EC_TRAINING_ORDER_FORBIDDEN, EC_TRAINING_ORDER_NOT_PAID, EC_TRAINING_PARTICIPANTS_INVALID,
  EC_TRAINING_PARTICIPANTS_COUNT_MISMATCH, EC_TRAINING_COURSE_NOT_FOUND,
  EC_TRAINING_COURSE_PRICE_INVALID, EC_TRAINING_PAYMENT_UNAVAILABLE, EC_TRAINING_SCHEDULE_NOT_FOUND,
  EC_TRAINING_SCHEDULE_CAPACITY_EXCEEDED, EC_NOTICE_NOT_FOUND_LEGACY, EC_NOTICE_NOT_FOUND,
  EC_OPPORTUNITY_NOT_FOUND, EC_REPORT_NOT_AVAILABLE, EC_OPPORTUNITY_CODE_REQUIRED,
  EC_CLAIM_SUPPLIER_NOT_FOUND, EC_CLAIM_ALREADY_APPROVED, EC_CLAIM_SELF_BOUND,
  EC_CLAIM_BOUND_BY_OTHER, EC_CLAIM_PENDING, EC_ENTERPRISE_NOT_BOUND,
  EC_ENTERPRISE_CLAIMED_BY_OTHER, EC_DIAGNOSIS_ANSWERS_INCOMPLETE, EC_DIAGNOSIS_ENTITY_NOT_FOUND,
  EC_POOL_FULL, EC_POOL_SUPPLIER_NOT_VERIFIED, EC_POOL_SUPPLIER_DUPLICATE,
  EC_KEYWORD_GROUP_LIMIT, EC_KEYWORD_GROUP_DUPLICATE, EC_KEYWORD_GROUP_NAME_INVALID,
  EC_KEYWORD_GROUP_NAME_RESERVED, EC_LEAD_FIELDS_REQUIRED, EC_LEAD_STATUS_INVALID,
  EC_CHAT_SESSION_MISSING, EC_CHAT_SESSION_CLOSED, EC_CHAT_RATE_INVALID,
  EC_AI_NOT_CONFIGURED, EC_AI_BAD_FORMAT, EC_AI_CALL_FAILED, EC_SUPPLIER_PROFILE_REQUIRED,
  EC_RFQ_NOT_FOUND, EC_RFQ_STATE_INVALID, EC_RFQ_VERSION_CONFLICT, EC_RFQ_REASON_REQUIRED,
  EC_RFQ_AUTHORIZATION_REQUIRED, EC_RFQ_PUBLISH_BLOCKED,
  EC_RFQ_RESPONSE_NOT_FOUND, EC_RFQ_RESPONSE_CLOSED, EC_RFQ_SEALED,
  EC_RFQ_NOT_OPENED, EC_RFQ_AWARD_EXISTS,
} from "../constants/api";

/** 错误语义分类（11 枚举；unknown 仅供前端兜底，catalog 不使用） */
export type ErrorKind =
  | "system" | "network" | "auth" | "forbidden" | "vipGate" | "industryWall"
  | "quota" | "payment" | "business" | "ai" | "unknown";

/** 单个错误的登记条目 */
export interface ErrorDef {
  /** 兼容层数字码（= EC_ 常量值，不重排） */
  readonly code: number;
  /** 稳定字符串错误标识主键（snake_case，与 EC_ 常量名一一对应） */
  readonly type: string;
  /** 规范 HTTP 状态（ADR-0021 §2.1 判据表） */
  readonly status: number;
  /** 前端语义分类 */
  readonly kind: ErrorKind;
  /** errors.json（7 语）的文案键 */
  readonly i18nKey: string;
  /** 本码已废弃：指向生效码（新代码禁止使用本码） */
  readonly deprecatedAliasOf?: number;
}

/** 全量错误目录（111 码 = 108 个生效 type + 3 个 deprecated 同义码） */
export const ERROR_CATALOG: Readonly<Record<number, ErrorDef>> = {
  // ── 通用 / 系统 ────────────────────────────────────────────────────────────
  [EC_INVALID_PARAMS]: { code: EC_INVALID_PARAMS, type: "invalid_params", status: 400, kind: "business", i18nKey: "errInvalidParams" },
  [EC_INVALID_REQUEST]: { code: EC_INVALID_REQUEST, type: "invalid_request_legacy", status: 400, kind: "business", i18nKey: "errInvalidParams", deprecatedAliasOf: EC_INVALID_PARAMS },
  [EC_NOT_FOUND]: { code: EC_NOT_FOUND, type: "not_found", status: 404, kind: "business", i18nKey: "errNotFound" },
  [EC_INTERNAL_ERROR]: { code: EC_INTERNAL_ERROR, type: "internal_error", status: 500, kind: "system", i18nKey: "errSystemBusy" },
  [EC_RATE_LIMITED]: { code: EC_RATE_LIMITED, type: "rate_limited", status: 429, kind: "system", i18nKey: "errRateLimited" },
  [EC_ENDPOINT_RETIRED]: { code: EC_ENDPOINT_RETIRED, type: "endpoint_retired", status: 410, kind: "business", i18nKey: "errEndpointRetired" },
  [EC_TOO_MANY_ACTIONS]: { code: EC_TOO_MANY_ACTIONS, type: "too_many_actions", status: 400, kind: "business", i18nKey: "errTooManyActions" },
  [EC_NO_VALID_ACTIONS]: { code: EC_NO_VALID_ACTIONS, type: "no_valid_actions", status: 400, kind: "business", i18nKey: "errNoValidActions" },
  [EC_PROXY_URL_MISSING]: { code: EC_PROXY_URL_MISSING, type: "proxy_url_missing", status: 400, kind: "business", i18nKey: "errProxyUrlMissing" },
  [EC_PROXY_RESPONSE_TOO_LARGE]: { code: EC_PROXY_RESPONSE_TOO_LARGE, type: "proxy_response_too_large", status: 413, kind: "business", i18nKey: "errProxyResponseTooLarge" },
  [EC_TRANSLATION_UNAVAILABLE]: { code: EC_TRANSLATION_UNAVAILABLE, type: "translation_unavailable", status: 503, kind: "system", i18nKey: "errServiceUnavailable" },
  [EC_DUPLICATE]: { code: EC_DUPLICATE, type: "duplicate", status: 409, kind: "business", i18nKey: "errDuplicate" },

  // ── 认证与会话 ──────────────────────────────────────────────────────────────
  [EC_AUTH_REQUIRED]: { code: EC_AUTH_REQUIRED, type: "auth_required", status: 401, kind: "auth", i18nKey: "errLoginRequired" },
  [EC_USER_REQUIRED]: { code: EC_USER_REQUIRED, type: "user_required_legacy", status: 401, kind: "auth", i18nKey: "errLoginRequired", deprecatedAliasOf: EC_AUTH_REQUIRED },
  [EC_SESSION_REQUIRED]: { code: EC_SESSION_REQUIRED, type: "session_required", status: 404, kind: "business", i18nKey: "errSessionRequired" },
  [EC_ACCOUNT_ISSUE]: { code: EC_ACCOUNT_ISSUE, type: "account_issue", status: 401, kind: "auth", i18nKey: "errAccountIssue" },
  [EC_PASSWORD_RESET_REQUIRED]: { code: EC_PASSWORD_RESET_REQUIRED, type: "password_reset_required", status: 403, kind: "auth", i18nKey: "errPasswordResetRequired" },
  [EC_ACCOUNT_DISABLED]: { code: EC_ACCOUNT_DISABLED, type: "account_disabled", status: 403, kind: "forbidden", i18nKey: "errAccountDisabled" },
  [EC_NICKNAME_INVALID]: { code: EC_NICKNAME_INVALID, type: "nickname_invalid", status: 400, kind: "business", i18nKey: "errNicknameInvalid" },
  [EC_INVITE_CODE_INVALID]: { code: EC_INVITE_CODE_INVALID, type: "invite_code_invalid", status: 400, kind: "business", i18nKey: "errInviteCodeInvalid" },
  [EC_TOO_MANY_ATTEMPTS]: { code: EC_TOO_MANY_ATTEMPTS, type: "too_many_attempts", status: 429, kind: "business", i18nKey: "errTooManyAttempts" },
  [EC_INVALID_CODE]: { code: EC_INVALID_CODE, type: "invalid_code", status: 400, kind: "auth", i18nKey: "errInvalidCode" },
  [EC_API_KEY_INVALID]: { code: EC_API_KEY_INVALID, type: "api_key_invalid", status: 401, kind: "auth", i18nKey: "errApiKeyInvalid" },
  [EC_API_KEY_EXPIRED]: { code: EC_API_KEY_EXPIRED, type: "api_key_expired", status: 401, kind: "auth", i18nKey: "errApiKeyExpired" },
  [EC_API_KEY_SUSPENDED]: { code: EC_API_KEY_SUSPENDED, type: "api_key_suspended", status: 403, kind: "auth", i18nKey: "errApiKeySuspended" },
  [EC_REFRESH_TOKEN_MISSING]: { code: EC_REFRESH_TOKEN_MISSING, type: "refresh_token_missing", status: 401, kind: "auth", i18nKey: "errLoginRequired" },
  [EC_REFRESH_TOKEN_INVALID]: { code: EC_REFRESH_TOKEN_INVALID, type: "refresh_token_invalid", status: 401, kind: "auth", i18nKey: "errSessionExpired" },
  [EC_REFRESH_TOKEN_EXPIRED]: { code: EC_REFRESH_TOKEN_EXPIRED, type: "refresh_token_expired", status: 401, kind: "auth", i18nKey: "errSessionExpired" },
  [EC_REFRESH_TOKEN_REVOKED]: { code: EC_REFRESH_TOKEN_REVOKED, type: "refresh_token_revoked", status: 401, kind: "auth", i18nKey: "errSessionExpired" },

  // ── 联系方式与通知 ──────────────────────────────────────────────────────────
  [EC_PHONE_ISSUE]: { code: EC_PHONE_ISSUE, type: "phone_issue", status: 400, kind: "business", i18nKey: "errPhoneIssue" },
  [EC_EMAIL_ISSUE]: { code: EC_EMAIL_ISSUE, type: "email_issue", status: 400, kind: "business", i18nKey: "errEmailIssue" },
  [EC_PHONE_NOT_BOUND]: { code: EC_PHONE_NOT_BOUND, type: "phone_not_bound", status: 400, kind: "business", i18nKey: "errPhoneNotBound" },
  [EC_EMAIL_NOT_BOUND]: { code: EC_EMAIL_NOT_BOUND, type: "email_not_bound", status: 400, kind: "business", i18nKey: "errEmailNotBound" },
  [EC_PHONE_ALREADY_BOUND]: { code: EC_PHONE_ALREADY_BOUND, type: "phone_already_bound", status: 409, kind: "business", i18nKey: "errPhoneAlreadyBound" },
  [EC_EMAIL_ALREADY_BOUND]: { code: EC_EMAIL_ALREADY_BOUND, type: "email_already_bound", status: 409, kind: "business", i18nKey: "errEmailAlreadyBound" },
  [EC_CONTACT_TAKEN_BY_OTHER]: { code: EC_CONTACT_TAKEN_BY_OTHER, type: "contact_taken_by_other", status: 409, kind: "business", i18nKey: "errContactTakenByOther" },
  [EC_SMS_NOT_CONFIGURED]: { code: EC_SMS_NOT_CONFIGURED, type: "sms_not_configured", status: 503, kind: "system", i18nKey: "errSmsNotConfigured" },
  [EC_EMAIL_NOT_CONFIGURED]: { code: EC_EMAIL_NOT_CONFIGURED, type: "email_not_configured", status: 503, kind: "system", i18nKey: "errEmailNotConfigured" },
  [EC_SMS_SEND_FAILED]: { code: EC_SMS_SEND_FAILED, type: "sms_send_failed", status: 502, kind: "system", i18nKey: "errSmsSendFailed" },
  [EC_EMAIL_SEND_FAILED]: { code: EC_EMAIL_SEND_FAILED, type: "email_send_failed", status: 502, kind: "system", i18nKey: "errEmailSendFailed" },

  // ── 权益与配额 ──────────────────────────────────────────────────────────────
  [EC_VIP_ONLY]: { code: EC_VIP_ONLY, type: "vip_only", status: 403, kind: "vipGate", i18nKey: "errVipFeatureOnly" },
  [EC_OUT_OF_CATEGORY]: { code: EC_OUT_OF_CATEGORY, type: "out_of_category", status: 403, kind: "industryWall", i18nKey: "errOutOfCategory" },
  [EC_CONTENT_LOCKED]: { code: EC_CONTENT_LOCKED, type: "content_locked", status: 403, kind: "forbidden", i18nKey: "errViewRequired" },
  [EC_FREE_LIMIT_REACHED]: { code: EC_FREE_LIMIT_REACHED, type: "free_limit_reached", status: 402, kind: "quota", i18nKey: "errFreeLimitReached" },
  [EC_PAID_QUOTA_REQUIRED]: { code: EC_PAID_QUOTA_REQUIRED, type: "paid_quota_required", status: 402, kind: "quota", i18nKey: "errPaidQuotaRequired" },
  [EC_API_QUOTA_EXCEEDED]: { code: EC_API_QUOTA_EXCEEDED, type: "api_quota_exceeded", status: 429, kind: "quota", i18nKey: "errApiQuotaExceeded" },
  [EC_UPGRADE_PLAN_REQUIRED]: { code: EC_UPGRADE_PLAN_REQUIRED, type: "upgrade_plan_required", status: 400, kind: "business", i18nKey: "errUpgradePlanRequired" },

  // ── 支付 ────────────────────────────────────────────────────────────────────
  [EC_PAYMENT_PROVIDER_UNAVAILABLE]: { code: EC_PAYMENT_PROVIDER_UNAVAILABLE, type: "payment_provider_unavailable", status: 503, kind: "payment", i18nKey: "payErrProviderUnavailable" },
  [EC_PAYMENT_QR_CODE_MISSING]: { code: EC_PAYMENT_QR_CODE_MISSING, type: "payment_qr_code_missing", status: 500, kind: "payment", i18nKey: "payErrQrMissing" },
  [EC_PAYMENT_ORDER_NOT_FOUND]: { code: EC_PAYMENT_ORDER_NOT_FOUND, type: "payment_order_not_found", status: 404, kind: "payment", i18nKey: "payErrOrderNotFound" },
  [EC_PAYMENT_PLAN_NOT_FOUND]: { code: EC_PAYMENT_PLAN_NOT_FOUND, type: "payment_plan_not_found", status: 404, kind: "payment", i18nKey: "payErrPlanNotFound" },
  [EC_PAYMENT_MATERIAL_NOT_FOUND]: { code: EC_PAYMENT_MATERIAL_NOT_FOUND, type: "payment_material_not_found", status: 404, kind: "payment", i18nKey: "payErrMaterialNotFound" },
  [EC_PAYMENT_BUNDLE_NOT_FOUND]: { code: EC_PAYMENT_BUNDLE_NOT_FOUND, type: "payment_bundle_not_found", status: 404, kind: "payment", i18nKey: "payErrBundleNotFound" },
  [EC_PAYMENT_USER_PLAN_REQUIRED]: { code: EC_PAYMENT_USER_PLAN_REQUIRED, type: "payment_user_plan_required", status: 401, kind: "payment", i18nKey: "payErrUserPlanRequired" },
  [EC_PAYMENT_PLAN_NOT_SELLABLE]: { code: EC_PAYMENT_PLAN_NOT_SELLABLE, type: "payment_plan_not_sellable", status: 400, kind: "payment", i18nKey: "payErrPlanNotSellable" },
  [EC_PAYMENT_AMOUNT_INVALID]: { code: EC_PAYMENT_AMOUNT_INVALID, type: "payment_amount_invalid", status: 400, kind: "payment", i18nKey: "payErrAmountInvalid" },
  [EC_PAYMENT_FREE_PLAN]: { code: EC_PAYMENT_FREE_PLAN, type: "payment_free_plan", status: 400, kind: "payment", i18nKey: "payErrFreePlan" },
  [EC_PAYMENT_UPGRADE_INVALID]: { code: EC_PAYMENT_UPGRADE_INVALID, type: "payment_upgrade_invalid", status: 400, kind: "payment", i18nKey: "payErrUpgradeInvalid" },
  [EC_PAYMENT_SERVICE_UNAVAILABLE]: { code: EC_PAYMENT_SERVICE_UNAVAILABLE, type: "payment_service_unavailable", status: 400, kind: "payment", i18nKey: "payErrServiceUnavailable" },
  [EC_PAYMENT_SERVICE_ADVISORY_ONLY]: { code: EC_PAYMENT_SERVICE_ADVISORY_ONLY, type: "payment_service_advisory_only", status: 400, kind: "payment", i18nKey: "payErrServiceAdvisoryOnly" },
  [EC_PAYMENT_SIGN_VERIFY_FAILED]: { code: EC_PAYMENT_SIGN_VERIFY_FAILED, type: "payment_sign_verify_failed", status: 400, kind: "payment", i18nKey: "payErrSignVerifyFailed" },
  [EC_PAYMENT_INDUSTRY_REQUIRED]: { code: EC_PAYMENT_INDUSTRY_REQUIRED, type: "payment_industry_required", status: 400, kind: "payment", i18nKey: "errPaymentIndustryRequired" },
  [EC_PAYMENT_INDUSTRY_INVALID]: { code: EC_PAYMENT_INDUSTRY_INVALID, type: "payment_industry_invalid", status: 400, kind: "payment", i18nKey: "errPaymentIndustryInvalid" },
  [EC_ACCESS_FORBIDDEN]: { code: EC_ACCESS_FORBIDDEN, type: "access_forbidden", status: 403, kind: "forbidden", i18nKey: "errForbidden" },
  [EC_FORBIDDEN]: { code: EC_FORBIDDEN, type: "forbidden", status: 403, kind: "forbidden", i18nKey: "errForbidden" },

  // ── 培训 ────────────────────────────────────────────────────────────────────
  [EC_TRAINING_ORDER_NOT_FOUND]: { code: EC_TRAINING_ORDER_NOT_FOUND, type: "training_order_not_found", status: 404, kind: "business", i18nKey: "errTrainingOrderNotFound" },
  [EC_TRAINING_ORDER_FORBIDDEN]: { code: EC_TRAINING_ORDER_FORBIDDEN, type: "training_order_forbidden", status: 403, kind: "forbidden", i18nKey: "errTrainingOrderForbidden" },
  [EC_TRAINING_ORDER_NOT_PAID]: { code: EC_TRAINING_ORDER_NOT_PAID, type: "training_order_not_paid", status: 400, kind: "business", i18nKey: "errTrainingOrderNotPaid" },
  [EC_TRAINING_PARTICIPANTS_INVALID]: { code: EC_TRAINING_PARTICIPANTS_INVALID, type: "training_participants_invalid", status: 400, kind: "business", i18nKey: "errTrainingParticipantsInvalid" },
  [EC_TRAINING_PARTICIPANTS_COUNT_MISMATCH]: { code: EC_TRAINING_PARTICIPANTS_COUNT_MISMATCH, type: "training_participants_count_mismatch", status: 400, kind: "business", i18nKey: "errTrainingParticipantsCountMismatch" },
  [EC_TRAINING_COURSE_NOT_FOUND]: { code: EC_TRAINING_COURSE_NOT_FOUND, type: "training_course_not_found", status: 404, kind: "business", i18nKey: "errTrainingCourseNotFound" },
  [EC_TRAINING_COURSE_PRICE_INVALID]: { code: EC_TRAINING_COURSE_PRICE_INVALID, type: "training_course_price_invalid", status: 400, kind: "business", i18nKey: "errTrainingCoursePriceInvalid" },
  [EC_TRAINING_PAYMENT_UNAVAILABLE]: { code: EC_TRAINING_PAYMENT_UNAVAILABLE, type: "training_payment_unavailable", status: 503, kind: "payment", i18nKey: "errTrainingPaymentUnavailable" },
  [EC_TRAINING_SCHEDULE_NOT_FOUND]: { code: EC_TRAINING_SCHEDULE_NOT_FOUND, type: "training_schedule_not_found", status: 404, kind: "business", i18nKey: "errTrainingScheduleNotFound" },
  [EC_TRAINING_SCHEDULE_CAPACITY_EXCEEDED]: { code: EC_TRAINING_SCHEDULE_CAPACITY_EXCEEDED, type: "training_schedule_capacity_exceeded", status: 409, kind: "business", i18nKey: "errTrainingScheduleCapacityExceeded" },

  // ── 公告 / 商机 / 报告 ──────────────────────────────────────────────────────
  [EC_NOTICE_NOT_FOUND]: { code: EC_NOTICE_NOT_FOUND, type: "notice_not_found", status: 404, kind: "business", i18nKey: "errNoticeNotFound" },
  [EC_NOTICE_NOT_FOUND_LEGACY]: { code: EC_NOTICE_NOT_FOUND_LEGACY, type: "notice_not_found_legacy", status: 404, kind: "business", i18nKey: "errNoticeNotFound", deprecatedAliasOf: EC_NOTICE_NOT_FOUND },
  [EC_OPPORTUNITY_NOT_FOUND]: { code: EC_OPPORTUNITY_NOT_FOUND, type: "opportunity_not_found", status: 404, kind: "business", i18nKey: "errOpportunityNotFound" },
  [EC_REPORT_NOT_AVAILABLE]: { code: EC_REPORT_NOT_AVAILABLE, type: "report_not_available", status: 404, kind: "business", i18nKey: "errReportNotAvailable" },
  [EC_OPPORTUNITY_CODE_REQUIRED]: { code: EC_OPPORTUNITY_CODE_REQUIRED, type: "opportunity_code_required", status: 400, kind: "business", i18nKey: "errOpportunityCodeRequired" },

  // ── 供应商 / 认领 / 企业 / 诊断 / 资源库 ────────────────────────────────────
  [EC_CLAIM_SUPPLIER_NOT_FOUND]: { code: EC_CLAIM_SUPPLIER_NOT_FOUND, type: "claim_supplier_not_found", status: 404, kind: "business", i18nKey: "errClaimSupplierNotFound" },
  [EC_CLAIM_ALREADY_APPROVED]: { code: EC_CLAIM_ALREADY_APPROVED, type: "claim_already_approved", status: 409, kind: "business", i18nKey: "errClaimAlreadyApproved" },
  [EC_CLAIM_SELF_BOUND]: { code: EC_CLAIM_SELF_BOUND, type: "claim_self_bound", status: 409, kind: "business", i18nKey: "errClaimSelfBound" },
  [EC_CLAIM_BOUND_BY_OTHER]: { code: EC_CLAIM_BOUND_BY_OTHER, type: "claim_bound_by_other", status: 409, kind: "business", i18nKey: "errClaimBoundByOther" },
  [EC_CLAIM_PENDING]: { code: EC_CLAIM_PENDING, type: "claim_pending", status: 409, kind: "business", i18nKey: "errClaimPending" },
  [EC_ENTERPRISE_NOT_BOUND]: { code: EC_ENTERPRISE_NOT_BOUND, type: "enterprise_not_bound", status: 400, kind: "business", i18nKey: "errEnterpriseNotBound" },
  [EC_ENTERPRISE_CLAIMED_BY_OTHER]: { code: EC_ENTERPRISE_CLAIMED_BY_OTHER, type: "enterprise_claimed_by_other", status: 409, kind: "business", i18nKey: "errEnterpriseClaimedByOther" },
  [EC_DIAGNOSIS_ANSWERS_INCOMPLETE]: { code: EC_DIAGNOSIS_ANSWERS_INCOMPLETE, type: "diagnosis_answers_incomplete", status: 400, kind: "business", i18nKey: "errDiagnosisAnswersIncomplete" },
  [EC_DIAGNOSIS_ENTITY_NOT_FOUND]: { code: EC_DIAGNOSIS_ENTITY_NOT_FOUND, type: "diagnosis_entity_not_found", status: 404, kind: "business", i18nKey: "errDiagnosisEntityNotFound" },
  [EC_POOL_FULL]: { code: EC_POOL_FULL, type: "pool_full", status: 409, kind: "business", i18nKey: "errPoolFull" },
  [EC_POOL_SUPPLIER_NOT_VERIFIED]: { code: EC_POOL_SUPPLIER_NOT_VERIFIED, type: "pool_supplier_not_verified", status: 400, kind: "business", i18nKey: "errPoolSupplierNotVerified" },
  [EC_POOL_SUPPLIER_DUPLICATE]: { code: EC_POOL_SUPPLIER_DUPLICATE, type: "pool_supplier_duplicate", status: 409, kind: "business", i18nKey: "errPoolSupplierDuplicate" },

  // ── 词组库 / 线索 ───────────────────────────────────────────────────────────
  [EC_KEYWORD_GROUP_LIMIT]: { code: EC_KEYWORD_GROUP_LIMIT, type: "keyword_group_limit", status: 400, kind: "business", i18nKey: "errKeywordGroupLimit" },
  [EC_KEYWORD_GROUP_DUPLICATE]: { code: EC_KEYWORD_GROUP_DUPLICATE, type: "keyword_group_duplicate", status: 409, kind: "business", i18nKey: "errKeywordGroupDuplicate" },
  [EC_KEYWORD_GROUP_NAME_INVALID]: { code: EC_KEYWORD_GROUP_NAME_INVALID, type: "keyword_group_name_invalid", status: 400, kind: "business", i18nKey: "errKeywordGroupNameInvalid" },
  [EC_KEYWORD_GROUP_NAME_RESERVED]: { code: EC_KEYWORD_GROUP_NAME_RESERVED, type: "keyword_group_name_reserved", status: 400, kind: "business", i18nKey: "errKeywordGroupNameReserved" },
  [EC_LEAD_FIELDS_REQUIRED]: { code: EC_LEAD_FIELDS_REQUIRED, type: "lead_fields_required", status: 400, kind: "business", i18nKey: "errLeadFieldsRequired" },
  [EC_LEAD_STATUS_INVALID]: { code: EC_LEAD_STATUS_INVALID, type: "lead_status_invalid", status: 400, kind: "business", i18nKey: "errLeadStatusInvalid" },

  // ── 客服会话 ────────────────────────────────────────────────────────────────
  [EC_CHAT_SESSION_MISSING]: { code: EC_CHAT_SESSION_MISSING, type: "chat_session_missing", status: 404, kind: "business", i18nKey: "errChatSessionMissing" },
  [EC_CHAT_SESSION_CLOSED]: { code: EC_CHAT_SESSION_CLOSED, type: "chat_session_closed", status: 409, kind: "business", i18nKey: "errChatSessionClosed" },
  [EC_CHAT_RATE_INVALID]: { code: EC_CHAT_RATE_INVALID, type: "chat_rate_invalid", status: 409, kind: "business", i18nKey: "errChatNotRatable" },

  // ── AI ──────────────────────────────────────────────────────────────────────
  [EC_AI_NOT_CONFIGURED]: { code: EC_AI_NOT_CONFIGURED, type: "ai_not_configured", status: 400, kind: "ai", i18nKey: "aiErrNotConfigured" },
  [EC_AI_BAD_FORMAT]: { code: EC_AI_BAD_FORMAT, type: "ai_bad_format", status: 502, kind: "ai", i18nKey: "aiErrBadFormat" },
  [EC_AI_CALL_FAILED]: { code: EC_AI_CALL_FAILED, type: "ai_call_failed", status: 502, kind: "ai", i18nKey: "aiErrCallFailed" },
  [EC_SUPPLIER_PROFILE_REQUIRED]: { code: EC_SUPPLIER_PROFILE_REQUIRED, type: "supplier_profile_required", status: 400, kind: "ai", i18nKey: "aiSupplierProfileRequired" },

  // ── RFQ 采购需求 ────────────────────────────────────────────────────────────
  [EC_RFQ_NOT_FOUND]: { code: EC_RFQ_NOT_FOUND, type: "rfq_not_found", status: 404, kind: "business", i18nKey: "errRfqNotFound" },
  [EC_RFQ_STATE_INVALID]: { code: EC_RFQ_STATE_INVALID, type: "rfq_state_invalid", status: 409, kind: "business", i18nKey: "errRfqStateInvalid" },
  [EC_RFQ_VERSION_CONFLICT]: { code: EC_RFQ_VERSION_CONFLICT, type: "rfq_version_conflict", status: 409, kind: "business", i18nKey: "errRfqVersionConflict" },
  [EC_RFQ_REASON_REQUIRED]: { code: EC_RFQ_REASON_REQUIRED, type: "rfq_reason_required", status: 400, kind: "business", i18nKey: "errRfqReasonRequired" },
  [EC_RFQ_AUTHORIZATION_REQUIRED]: { code: EC_RFQ_AUTHORIZATION_REQUIRED, type: "rfq_authorization_required", status: 403, kind: "business", i18nKey: "errRfqAuthorizationRequired" },
  [EC_RFQ_PUBLISH_BLOCKED]: { code: EC_RFQ_PUBLISH_BLOCKED, type: "rfq_publish_blocked", status: 409, kind: "business", i18nKey: "errRfqPublishBlocked" },
  [EC_RFQ_RESPONSE_NOT_FOUND]: { code: EC_RFQ_RESPONSE_NOT_FOUND, type: "rfq_response_not_found", status: 404, kind: "business", i18nKey: "errRfqResponseNotFound" },
  [EC_RFQ_RESPONSE_CLOSED]: { code: EC_RFQ_RESPONSE_CLOSED, type: "rfq_response_closed", status: 409, kind: "business", i18nKey: "errRfqResponseClosed" },
  [EC_RFQ_SEALED]: { code: EC_RFQ_SEALED, type: "rfq_sealed", status: 403, kind: "business", i18nKey: "errRfqSealed" },
  [EC_RFQ_NOT_OPENED]: { code: EC_RFQ_NOT_OPENED, type: "rfq_not_opened", status: 409, kind: "business", i18nKey: "errRfqNotOpened" },
  [EC_RFQ_AWARD_EXISTS]: { code: EC_RFQ_AWARD_EXISTS, type: "rfq_award_exists", status: 409, kind: "business", i18nKey: "errRfqAwardExists" },
};

/** 生效错误定义（排除 deprecated 同义码） */
export function activeErrorDefs(): ErrorDef[] {
  return Object.values(ERROR_CATALOG).filter((d) => !d.deprecatedAliasOf);
}

/** 按数字码查目录（含 deprecated） */
export function lookupErrorDef(code: number): ErrorDef | undefined {
  return ERROR_CATALOG[code];
}

/** EC_ 常量名 → type 派生规则（EC_NOTICE_NOT_FOUND → notice_not_found_404），供一致性校验 */
export function expectedTypeFromConstantName(constantName: string): string {
  return constantName.replace(/^EC_/, "").toLowerCase();
}
