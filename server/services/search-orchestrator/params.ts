/**
 * 统一搜索编排器 — 参数校验与归一化
 * Unified search orchestrator — parameter validation & normalization
 *
 * @module server/services/search-orchestrator/params
 */
import type { UnifiedSearchParams, SearchMode } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 采购类型白名单：与 search.routes.ts 的 isValidNoticeType 保持一致
const VALID_NOTICE_TYPES = new Set([
  "ITB", "ITT", "RFQ", "RFP", "EOI", "PQ", "PRE", "IC", "RFI", "GPN",
]);

function isValidNoticeType(val: string): boolean {
  if (!val) return false;
  if (VALID_NOTICE_TYPES.has(val.toUpperCase().trim())) return true;
  if (/^[A-Za-z\s_-]+$/.test(val) && val.length > 10) return false;
  return true;
}

/** 原始查询参数（路由层解析后传入） */
export interface RawSearchParams {
  mode?: string;
  userKey?: string;
  page?: number;
  pageSize?: number;
  locale?: string;
  q?: string;
  country?: string;
  agency?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  deadlineWithinDays?: number;
  noticeType?: string;
  featuredOnly?: boolean;
  sort?: string;
  codeId?: number;
}

/**
 * 校验并归一化搜索参数。
 * 规则：长度截断、日期格式校验、枚举值钳制、无效 noticeType 丢弃。
 */
export function validateParams(raw: RawSearchParams): UnifiedSearchParams {
  const mode: SearchMode =
    raw.mode === "prefs" || raw.mode === "recommended" ? raw.mode : "default";

  const sort =
    raw.sort === "latest" ? "latest"
    : raw.sort === "deadline" ? "deadline"
    : "deadline_farthest";

  const deadlineFrom = raw.deadlineFrom && DATE_RE.test(raw.deadlineFrom) ? raw.deadlineFrom : "";
  const deadlineTo = raw.deadlineTo && DATE_RE.test(raw.deadlineTo) ? raw.deadlineTo : "";

  const noticeTypeRaw = String(raw.noticeType || "").slice(0, 100);
  const noticeType = isValidNoticeType(noticeTypeRaw) ? noticeTypeRaw : "";

  return {
    mode,
    userKey: String(raw.userKey || ""),
    page: Math.min(Math.max(Math.floor(raw.page || 1), 1), 1000),
    pageSize: Math.min(Math.max(Math.floor(raw.pageSize || 9), 6), 30),
    locale: String(raw.locale || ""),
    q: String(raw.q || "").slice(0, 200).trim(),
    country: String(raw.country || "").slice(0, 100),
    agency: String(raw.agency || "").slice(0, 100),
    deadlineFrom,
    deadlineTo,
    deadlineWithinDays: Math.min(Math.max(Math.floor(raw.deadlineWithinDays || 0), 0), 365),
    noticeType,
    featuredOnly: !!raw.featuredOnly,
    sort,
    codeId: Math.max(Math.floor(raw.codeId || 0), 0),
  };
}

/**
 * 缓存键：mode + 全部影响结果的参数。
 * B3 优化：归一化 q（trim+lowercase）和 country（uppercase），
 * 避免 "Water"/"water"、"Kenya"/"KENYA" 生成不同键导致命中率稀释。
 */
export function searchCacheKey(p: UnifiedSearchParams): string {
  return [
    p.mode, p.userKey, p.page, p.pageSize, p.locale,
    p.q.toLowerCase().trim(), p.country.toUpperCase(), p.agency, p.deadlineFrom, p.deadlineTo,
    p.deadlineWithinDays, p.noticeType, p.featuredOnly ? "1" : "",
    p.sort, p.codeId,
  ].join("|");
}
