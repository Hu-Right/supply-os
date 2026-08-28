/**
 * 统一搜索编排器 — 参数校验与归一化
 * Unified search orchestrator — parameter validation & normalization
 *
 * @module server/services/search-orchestrator/params
 */
import type { UnifiedSearchParams, SearchMode } from "./types";
import { isKnownNoticeType } from "../../utils/notice-type";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  // N2 收敛（2026-08-20）：类型合法性唯一端口（utils/notice-type），删除手工白名单副本，
  // 修复 COMPETITIVE/CONTRACT_NOTICE 等扩展类型被 length>10 规则静默拦截的漂移 BUG。
  const noticeType = isKnownNoticeType(noticeTypeRaw) ? noticeTypeRaw : "";

  return {
    mode,
    userKey: String(raw.userKey || ""),
    page: Math.min(Math.max(Math.floor(raw.page || 1), 1), 1000),
    pageSize: Math.min(Math.max(Math.floor(raw.pageSize || 10), 6), 30),
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
