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

  it("流式回传的裸字符串（非 Error 实例）同样走令牌桥接", () => {
    expect(mapApiError("LLM_HTTP_429", t)).toBe("K:aiErrRateLimited");
  });
});

describe("状态兜底与锁定 detail", () => {
  it("403 + core_locked detail → 引导解锁", () => {
    const c = classifyApiError(new ApiError(403, "Forbidden", undefined, { core_locked: true }));
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
