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
