/**
 * UNSPSC 码解析纯函数
 * UNSPSC code parsing pure functions
 *
 * @module server/services/unspsc/parser
 * @description 无外部依赖的纯函数：码归一化、前缀提取、补位等。
 *              可独立单测，不涉及数据库或缓存。
 */
import { safeJson } from "../../utils/json";

export type UnspscCodeRow = {
  id: number;
  code: string;
  title?: string | null;
  title_zh?: string | null;
  parent_id?: number | null;
  level: number;
};

/**
 * 归一化 UNSPSC 码：从 JSON 字符串/对象/数组中提取所有有效码
 */
export function normalizeUnspscCodes(value: any) {
  const source = safeJson(value);
  const found = new Map<string, { code: string; name: string }>();

  const visit = (item: any) => {
    if (!item || found.size >= 20) return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item === "object") {
      const codeText = String(item.code || "");
      const matches = codeText.match(/\b\d{2}(?:\d{2}){0,3}\b/g) || [];
      for (const code of matches) {
        if (!found.has(code)) found.set(code, { code, name: String(item.name || item.description || "") });
      }
      if (matches.length === 0) Object.values(item).forEach(visit);
      return;
    }
    const matches = String(item).match(/\b\d{2}(?:\d{2}){0,3}\b/g) || [];
    for (const code of matches) {
      if (!found.has(code)) found.set(code, { code, name: "" });
    }
  };

  visit(source);
  return Array.from(found.values());
}

/**
 * 从完整码串中提取有效前缀（去除尾部 00 段）
 */
export function unspscPrefixFromCode(code: string) {
  const digits = String(code || "").replace(/\D/g, "").slice(0, 8);
  if (!digits) return "";
  for (let len = 8; len > 2; len -= 2) {
    if (digits.slice(len - 2, len) !== "00") return digits.slice(0, len);
  }
  return digits.slice(0, 2);
}

/**
 * 展开兴趣码前缀：从完整码生成所有层级前缀
 */
export function expandUnspscInterestPrefixes(code: string) {
  const significant = unspscPrefixFromCode(code);
  if (!significant) return [];
  const prefixes: string[] = [];
  for (let len = 2; len <= significant.length; len += 2) {
    prefixes.push(significant.slice(0, len));
  }
  return Array.from(new Set(prefixes));
}

/**
 * 补位前缀：将短前缀补 0 至 8 位
 */
export function padUnspscPrefix(prefix: string) {
  return String(prefix || "").padEnd(8, "0").slice(0, 8);
}
