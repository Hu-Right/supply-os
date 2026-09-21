/**
 * AI 摘要服务错误类型
 * @module lib/services/ai-summary/errors
 */
import { RouteError } from "../../middleware/route-handler";

/** 用户未配置 LLM API Key（400） */
export function errLlmNotConfigured(): never {
  throw new RouteError(400, 40001, "请先配置 LLM API Key");
}

/** 公告不存在（404） */
export function errNoticeNotFound(): never {
  throw new RouteError(404, 40006, "公告不存在");
}

/** LLM 调用失败（502） */
export function errLlmCallFailed(detail?: string): never {
  throw new RouteError(502, 50002, `LLM 调用失败${detail ? `：${detail}` : ""}`);
}

/** LLM 返回格式异常（422） */
export function errLlmBadFormat(): never {
  throw new RouteError(422, 40010, "LLM 返回格式异常，请尝试重新分析");
}

/**
 * 缺企业画像（未绑定 supplier 或无企业资料）（400）。
 * message 携带稳定 ASCII 令牌 `SUPPLIER_PROFILE_REQUIRED`，供前端映射为“先完善企业信息”友好提示
 * （而非默认“AI 错误”兼底）；不因身份/认证“惩罚式”拦截，仅在确实无评分对象时提示。
 */
export function errSupplierProfileRequired(): never {
  throw new RouteError(400, 40009, "SUPPLIER_PROFILE_REQUIRED:未绑定企业或缺少企业画像资料，无法进行 AI 适配评分");
}
