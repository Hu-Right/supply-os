/**
 * error-map 单测 —— 统一用户友好错误提示层（2026-10-12）
 *
 * 覆盖：
 *   1) 稳定码 → i18n 键（含 Phase A 新增的业务规则细分码与支付细分码）
 *   2) 令牌桥接优先级：BYOK 凭证类必须先于登录态（LLM_HTTP_401 含 "401" 子串，
 *      历史事故是把「模型 Key 被服务商拒绝」误报成「登录已过期」）
 *   3) 403 锁定 detail、HTTP 状态兜底、网络层失败、unknown 回落
 *   4) 键闭合：源码里出现的每个 i18n 键必须在六语 errors.json 都存在
 *      （本模块的键是手写常量表，check-i18n 只比对包之间 parity，抓不到「引用了不存在的键」）
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("@/core/perf", () => ({ recordApiMetric: vi.fn() }));

import { ApiError } from "@/core/http/api-client";
import { classifyApiError, mapApiError, resolveErrorText } from "@/core/http/error-map";
import {
  EC_VIP_ONLY, EC_CLAIM_BOUND_BY_OTHER, EC_POOL_FULL, EC_LEAD_STATUS_INVALID,
  EC_PAYMENT_SINGLE_FIRST_PURCHASE, EC_PAYMENT_AMOUNT_INVALID, EC_INTERNAL_ERROR,
  EC_PHONE_NOT_BOUND, EC_ACCOUNT_DISABLED, EC_TOO_MANY_ATTEMPTS, EC_REFRESH_TOKEN_INVALID,
  EC_CONTENT_LOCKED, EC_CHAT_SESSION_CLOSED, EC_CHAT_RATE_INVALID,
  EC_SESSION_REQUIRED, EC_TOO_MANY_ACTIONS, EC_NO_VALID_ACTIONS,
  EC_INVALID_PARAMS, EC_USER_REQUIRED,
  EC_AI_NOT_CONFIGURED, EC_AI_BAD_FORMAT, EC_AI_CALL_FAILED, EC_SUPPLIER_PROFILE_REQUIRED,
  EC_INVITE_CODE_INVALID, EC_TRANSLATION_UNAVAILABLE,
} from "@/shared/constants/api";
import zhErrors from "@/core/i18n/locales/zh/errors.json";
import enErrors from "@/core/i18n/locales/en/errors.json";
import ruErrors from "@/core/i18n/locales/ru/errors.json";
import esErrors from "@/core/i18n/locales/es/errors.json";
import frErrors from "@/core/i18n/locales/fr/errors.json";
import arErrors from "@/core/i18n/locales/ar/errors.json";

/** 打标翻译器：断言「映射到哪一键」而不是「翻成哪国文案」 */
const t = (key: string) => `K:${key}`;

describe("稳定码 → i18n 键", () => {
  it("Phase A 业务细分码各自成键，不再共用通用参数错", () => {
    expect(mapApiError(new ApiError(400, "该公司已被其他账户认领，无法重复认领", EC_CLAIM_BOUND_BY_OTHER), t)).toBe("K:errClaimBoundByOther");
    expect(mapApiError(new ApiError(400, "资源库已满", EC_POOL_FULL), t)).toBe("K:errPoolFull");
    expect(mapApiError(new ApiError(400, "无效的跟进状态", EC_LEAD_STATUS_INVALID), t)).toBe("K:errLeadStatusInvalid");
  });

  it("支付细分码承接原 mapPaymentError 全部语义", () => {
    expect(mapApiError(new ApiError(409, "首单特惠仅限首次购买", EC_PAYMENT_SINGLE_FIRST_PURCHASE), t)).toBe("K:payErrSingleFirstPurchase");
    expect(mapApiError(new ApiError(400, "支付金额异常", EC_PAYMENT_AMOUNT_INVALID), t)).toBe("K:payErrAmountInvalid");
  });

  it("码优先于消息：消息是技术串也按码翻译", () => {
    expect(mapApiError(new ApiError(500, "Error: connect ETIMEDOUT ::1:3306", EC_INTERNAL_ERROR), t)).toBe("K:errSystemBusy");
  });

  it("VIP 档位码带 required_rank detail → kind=vipGate 且 rank 透出（供升级引导卡渲染）", () => {
    const c = classifyApiError(new ApiError(403, "VIP only", EC_VIP_ONLY, { required_rank: 3 }));
    expect(c).toMatchObject({ kind: "vipGate", key: "errVipFeatureOnly", requiredRank: 3 });
  });

  it("VIP 档位码缺 detail → requiredRank 为 undefined，不写进 0 档", () => {
    expect(classifyApiError(new ApiError(403, "VIP only", EC_VIP_ONLY)).requiredRank).toBeUndefined();
  });

  it("auth 治本：认证域专属码各自成键，不再借他域号导致张冠李戴", () => {
    expect(mapApiError(new ApiError(400, "尚未绑定手机号", EC_PHONE_NOT_BOUND), t)).toBe("K:errPhoneNotBound");
    expect(mapApiError(new ApiError(403, "账号已停用", EC_ACCOUNT_DISABLED), t)).toBe("K:errAccountDisabled");
    expect(mapApiError(new ApiError(429, "尝试次数过多", EC_TOO_MANY_ATTEMPTS), t)).toBe("K:errTooManyAttempts");
    expect(classifyApiError(new ApiError(401, "刷新令牌无效", EC_REFRESH_TOKEN_INVALID)).key).toBe("errSessionExpired");
  });

  it("回归：解绑手机错误不再被解析为「课程不存在」（旧 40030 撞码缺陷）", () => {
    // 历史 auth 用裸数字 40030（= EC_TRAINING_COURSE_NOT_FOUND），导致前端弹课程文案。
    // 治本后该语义改用 EC_PHONE_NOT_BOUND(41103)，映射须归 errPhoneNotBound 而非 errTrainingCourseNotFound。
    expect(classifyApiError(new ApiError(400, "尚未绑定手机号", EC_PHONE_NOT_BOUND)).key).not.toBe("errTrainingCourseNotFound");
  });

  it("全域治本：内容锁定/会话/反馈批量码各自成键，历史撞码点全部归位", () => {
    expect(mapApiError(new ApiError(403, "公告已锁定，请先解锁", EC_CONTENT_LOCKED, { coreLocked: true }), t)).toBe("K:errUnlockRequired");
    expect(mapApiError(new ApiError(409, "会话已结束", EC_CHAT_SESSION_CLOSED), t)).toBe("K:errChatSessionClosed");
    expect(mapApiError(new ApiError(409, "会话未结束或已评价过", EC_CHAT_RATE_INVALID), t)).toBe("K:errChatNotRatable");
    expect(mapApiError(new ApiError(400, "缺少会话标识", EC_SESSION_REQUIRED), t)).toBe("K:errSessionRequired");
    expect(mapApiError(new ApiError(400, "单次最多 50 条操作", EC_TOO_MANY_ACTIONS), t)).toBe("K:errTooManyActions");
    expect(mapApiError(new ApiError(400, "无有效操作", EC_NO_VALID_ACTIONS), t)).toBe("K:errNoValidActions");
  });

  it("回归：注册字段校验不再借 40001 弹「请先登录」（旧 codeByPath password:40001 撞 EC_USER_REQUIRED）", () => {
    // 治本后 register codeByPath 用 EC_INVALID_PARAMS（刻意不登记）→ 后端 message 直出，绝不落到 errLoginRequired。
    expect(classifyApiError(new ApiError(400, "密码不能为空", EC_INVALID_PARAMS)).key).not.toBe("errLoginRequired");
    expect(mapApiError(new ApiError(400, "密码不能为空", EC_INVALID_PARAMS), () => "")).toBe("密码不能为空");
    // 对照：真正的 EC_USER_REQUIRED 才应翻成登录提示
    expect(classifyApiError(new ApiError(401, "请先登录", EC_USER_REQUIRED)).key).toBe("errLoginRequired");
  });

  it("回归：service 层 AI/翻译/邀请码不再撞他域码（旧 40001/40010/50002/50001/40031 错弹）", () => {
    // 旧：errLlmNotConfigured 用 40001 → 撞 EC_USER_REQUIRED 弹「请先登录」
    expect(mapApiError(new ApiError(400, "请先配置 LLM API Key", EC_AI_NOT_CONFIGURED), t)).toBe("K:aiErrNotConfigured");
    // 旧：errLlmBadFormat 用 40010 → 撞 EC_PAYMENT_PROVIDER_UNAVAILABLE 弹「支付渠道」
    expect(mapApiError(new ApiError(422, "LLM 返回格式异常", EC_AI_BAD_FORMAT), t)).toBe("K:aiErrBadFormat");
    // 旧：errLlmCallFailed 用 50002 → 撞 EC_TRANSLATION_UNAVAILABLE
    expect(mapApiError(new ApiError(502, "LLM 调用失败", EC_AI_CALL_FAILED), t)).toBe("K:aiErrCallFailed");
    expect(mapApiError(new ApiError(400, "SUPPLIER_PROFILE_REQUIRED", EC_SUPPLIER_PROFILE_REQUIRED), t)).toBe("K:aiSupplierProfileRequired");
    // 旧：翻译不可用用 50001 → 撞 EC_PAYMENT_QR_CODE_MISSING
    expect(mapApiError(new ApiError(503, "翻译服务暂不可用", EC_TRANSLATION_UNAVAILABLE), t)).toBe("K:errServiceUnavailable");
    // 旧：邀请码无效用 40031 → 撞 EC_TRAINING_COURSE_NOT_FOUND
    expect(mapApiError(new ApiError(400, "邀请码无效", EC_INVITE_CODE_INVALID), t)).toBe("K:errInviteCodeInvalid");
  });
});

describe("令牌桥接（AI / 遗留）", () => {
  it("LLM_HTTP_401 归「模型 Key 被拒」，不得因含 401 子串误判为登录过期", () => {
    const c = classifyApiError(new Error("LLM_HTTP_401: invalid api key"));
    expect(c.kind).toBe("ai");
    expect(c.key).toBe("aiErrKeyRejected");
  });

  it("真正的登录态令牌才翻成登录过期", () => {
    expect(classifyApiError(new Error("HTTP 401 Unauthorized")).key).toBe("aiErrLoginRequired");
  });

  it("未配置 Key / 配额 / 坏格式各有其键", () => {
    expect(classifyApiError(new Error("LLM_NOT_CONFIGURED")).key).toBe("aiErrNotConfigured");
    expect(classifyApiError(new Error("LLM_HTTP_429 too many requests")).key).toBe("aiErrRateLimited");
    expect(classifyApiError(new Error("LLM_BAD_JSON")).key).toBe("aiErrBadFormat");
    expect(classifyApiError(new Error("SUPPLIER_PROFILE_REQUIRED")).key).toBe("aiSupplierProfileRequired");
  });

  it("LLM_HTTP_400/404 等 4xx（非凭证/限流）归「模型调用失败」，不再塌成系统繁忙；但 401/402/403/429 仍优先各归其类", () => {
    expect(classifyApiError(new Error("LLM_HTTP_400: The model does not exist")).key).toBe("aiErrCallFailed");
    expect(classifyApiError(new Error("LLM_HTTP_404: not found")).key).toBe("aiErrCallFailed");
    expect(classifyApiError(new Error("LLM_HTTP_403: forbidden")).key).toBe("aiErrKeyRejected");
    expect(classifyApiError(new Error("LLM_HTTP_429: slow down")).key).toBe("aiErrRateLimited");
  });

  it("流式回传的裸字符串（非 Error 实例）同样走令牌桥接", () => {
    expect(mapApiError("LLM_HTTP_429", t)).toBe("K:aiErrRateLimited");
  });
});

describe("状态兜底与锁定 detail", () => {
  it("403 + coreLocked detail → 引导解锁", () => {
    const c = classifyApiError(new ApiError(403, "Forbidden", undefined, { coreLocked: true }));
    expect(c).toMatchObject({ kind: "forbidden", key: "errUnlockRequired" });
  });

  it("无稳定码时按 HTTP 状态兜底（避开令牌桥接的精确串）", () => {
    expect(classifyApiError(new ApiError(401, "no session cookie")).key).toBe("errLoginRequired");
    expect(classifyApiError(new ApiError(403, "Forbidden")).key).toBe("errForbidden");
    expect(classifyApiError(new ApiError(404, "missing resource")).key).toBe("errNotFound");
    expect(classifyApiError(new ApiError(429, "slow down")).key).toBe("errRateLimited");
    expect(classifyApiError(new ApiError(503, "upstream down")).key).toBe("errServiceUnavailable");
    expect(classifyApiError(new ApiError(504, "gate way")).key).toBe("errTimeout");
  });
});

describe("网络层与未知错误回落", () => {
  it("fetch 抛出的 TypeError → 网络异常，不显示技术串", () => {
    expect(classifyApiError(new TypeError("Failed to fetch"))).toMatchObject({ kind: "network", key: "errNetworkOffline" });
    expect(mapApiError("NetworkError when attempting to fetch resource.", t)).toBe("K:errNetworkOffline");
  });

  it("未知错误 + 人类可读中文消息 → 原样展示（后端消息本就是给用户看的）", () => {
    expect(mapApiError(new Error("今日导出次数已用完"), t)).toBe("今日导出次数已用完");
  });

  it("未知错误 + 纯技术串 → 通用兜底，绝不外泄堆栈", () => {
    expect(mapApiError(new Error("Cannot read properties of undefined"), t)).toBe("K:errSystemBusy");
  });

  it("无 t 注入时仍可渲染：中文直出 / 否则固定兜底", () => {
    expect(mapApiError(new Error("系统繁忙，请稍后重试"))).toBe("系统繁忙，请稍后重试");
    expect(mapApiError(new TypeError("Failed to fetch"))).toBe("请求失败，请稍后重试");
  });
});

describe("resolveErrorText：预先分类后存状态、渲染时再翻译", () => {
  it("空分类 → 空串（组件据此不渲染错误条）", () => {
    expect(resolveErrorText(null, t)).toBe("");
    expect(resolveErrorText(undefined, t)).toBe("");
  });

  it("命中键 → 走 t(key)", () => {
    const c = classifyApiError(new ApiError(400, "x", EC_POOL_FULL));
    expect(resolveErrorText(c, t)).toBe("K:errPoolFull");
  });

  it("未登记键 + 人类可读中文 → 原样展示", () => {
    const c = classifyApiError(new Error("今日导出次数已用完"));
    expect(c.key).toBeNull();
    expect(resolveErrorText(c, t)).toBe("今日导出次数已用完");
  });

  it("未登记键 + 纯技术串 → 通用兜底", () => {
    expect(resolveErrorText(classifyApiError(new Error("ENOENT: no such file")), t)).toBe("K:errSystemBusy");
  });
});

describe("键闭合：error-map 引用的每个键都要在六语 errors.json 里存在", () => {
  const locales = { zh: zhErrors, en: enErrors, ru: ruErrors, es: esErrors, fr: frErrors, ar: arErrors };

  const source = readFileSync("src/core/http/error-map.ts", "utf8");
  const referenced = new Set<string>();
  for (const m of source.matchAll(/key:\s*"([A-Za-z0-9_]+)"/g)) referenced.add(m[1]);
  for (const m of source.matchAll(/\bt\("([A-Za-z0-9_]+)"\)/g)) referenced.add(m[1]);

  it("确实提取到了键引用（防止正则失效导致空集假绿）", () => {
    expect(referenced.size).toBeGreaterThan(50);
  });

  for (const [lang, bundle] of Object.entries(locales)) {
    it(`${lang}: 全部键有文案`, () => {
      const missing = [...referenced].filter((key) => !(key in bundle));
      expect(missing, `${lang}/errors.json 缺键`).toEqual([]);
    });
  }

  it("六语 errors.json 键集完全一致", () => {
    const base = Object.keys(zhErrors).sort();
    for (const [lang, bundle] of Object.entries(locales)) {
      if (lang === "zh") continue;
      expect(Object.keys(bundle).sort(), `${lang} 与 zh 键集不同`).toEqual(base);
    }
  });
});
