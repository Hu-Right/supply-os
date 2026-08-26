/**
 * 查询参数解析工具
 * Query Parameter Parsing Utilities
 *
 * @module server/utils/params
 * @description 提供类型安全的查询参数解析，消除路由层重复的 Number/parseInt 模式。
 *              非法参数（如 ?page=abc）返回默认值而非抛异常，防止 500。
 */
import type { ParsedQs } from "qs";

/**
 * 安全解析可选整数参数。
 * - 非数字/NaN → 返回 fallback
 * - 结果 clamp 到 [min, max]
 *
 * @example
 * parseOptionalInt(req.query, "page", 1, 1000, 1)
 * parseOptionalInt(req.query, "value_min", 0, 1e12, 0)
 */
export function parseOptionalInt(
  query: ParsedQs,
  key: string,
  min: number,
  max: number,
  fallback = 0,
): number {
  const raw = query[key];
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

/** 安全解析可选字符串参数（trim + 最大长度截断） */
export function parseOptionalString(
  query: ParsedQs,
  key: string,
  maxLen = 200,
): string {
  return String(query[key] || "").trim().slice(0, maxLen);
}
