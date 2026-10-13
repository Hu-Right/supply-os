/**
 * 统一搜索编排器 — 参数校验与归一化
 * Unified search orchestrator — parameter validation & normalization
 *
 * @module server/services/search-orchestrator/params
 * @description crm_users.user_key 列退役收尾：身份参数仅保留 userId，
 *              缓存键生成不再回退 userKey，避免游客/登录用户键混淆。
 */
import type { UnifiedSearchParams, SearchMode } from "./types";
import { isKnownNoticeType } from "../../utils/notice-type";
import { isCommodityGroupCode } from "../commodity/groups";
import { normalizeBackboneNodeKey } from "../commodity/backbone-path";
import { isCommodityNodeKey } from "../commodity/tree";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 原始查询参数（路由层解析后传入） */
export interface RawSearchParams {
  mode?: string;
  userId?: number;
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
  /** 品目大类码（URL group）：只接受 32 类常量内的码，其余一律丢弃 */
  groupCode?: string;
  /** 品目骨架树筛选键（URL commodity）：只接受 UGT- 节点码（码内 2/4/6/8/10 位） */
  commodityPath?: string;
  /** 行业墙（服务端 industry-scope 注入；不接受客户端传参）：订阅大类的 L1 节点码 */
  wall?: { nodes: string[] } | null;
  budgetMin?: number;
  budgetMax?: number;
  /** 关键词匹配模式：all=硬 AND（默认），any=OR（任一命中） */
  matchMode?: string;
}

/**
 * 校验并归一化搜索参数。
 * 规则：长度截断、日期格式校验、枚举值钳制、无效 noticeType 丢弃。
 */
export function validateParams(raw: RawSearchParams): UnifiedSearchParams {
  const mode: SearchMode =
    raw.mode === "prefs" || raw.mode === "recommended" ? raw.mode : "default";

  const sort =
    raw.sort === "deadline" ? "deadline"
    : raw.sort === "deadline_farthest" ? "deadline_farthest"
    : "latest";

  const deadlineFrom = raw.deadlineFrom && DATE_RE.test(raw.deadlineFrom) ? raw.deadlineFrom : "";
  const deadlineTo = raw.deadlineTo && DATE_RE.test(raw.deadlineTo) ? raw.deadlineTo : "";

  const noticeTypeRaw = String(raw.noticeType || "").slice(0, 100);
  // N2 收敛（2026-08-20）：类型合法性唯一端口（utils/notice-type），删除手工白名单副本，
  // 修复 COMPETITIVE/CONTRACT_NOTICE 等扩展类型被 length>10 规则静默拦截的漂移 BUG。
  const noticeType = isKnownNoticeType(noticeTypeRaw) ? noticeTypeRaw : "";

  return {
    mode,
    userId: raw.userId,
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
    groupCode: raw.groupCode && isCommodityGroupCode(raw.groupCode) ? raw.groupCode : undefined,
    commodityPath: (() => {
      const k = normalizeBackboneNodeKey(raw.commodityPath);
      return k && isCommodityNodeKey(k) ? k : undefined;
    })(),
    // 墙是服务端派生值，仍逐码过形制：脏码进 Meili filter 是「永不命中」而非报错。
    // 但**不能把空 nodes 洗成 undefined**（那等于「没墙→放开全量」）：
    // raw.wall 存在就保留，归一为 {nodes:[]} 交给 filter-builder 返空结果。
    wall: raw.wall ? { nodes: raw.wall.nodes.filter((n) => isCommodityNodeKey(n)) } : undefined,
    budgetMin: raw.budgetMin != null && raw.budgetMin >= 0 ? Math.floor(raw.budgetMin) : undefined,
    budgetMax: raw.budgetMax != null && raw.budgetMax >= 0 ? Math.floor(raw.budgetMax) : undefined,
    matchMode: raw.matchMode === "any" ? "any" : "all",
  };
}

/**
 * 缓存键：mode + 全部影响结果的参数。
 * B3 优化：归一化 q（trim+lowercase）和 country（uppercase），
 * 避免 "Water"/"water"、"Kenya"/"KENYA" 生成不同键导致命中率稀释。
 * 身份维度：仅使用 userId（未登录用户以 "guest" 占位，与登录用户完全隔离）。
 */
export function searchCacheKey(p: UnifiedSearchParams): string {
  return [
    p.mode, p.userId ?? "guest", p.page, p.pageSize, p.locale,
    p.q.toLowerCase().trim(), p.country.toUpperCase(), p.agency, p.deadlineFrom, p.deadlineTo,
    p.deadlineWithinDays, p.noticeType, p.featuredOnly ? "1" : "",
    p.sort, p.codeId, p.budgetMin ?? "", p.budgetMax ?? "", p.matchMode ?? "all",
    // 墙必须带括号哨：空 nodes 的墙（分叉态→空结果）与无墙（→全量）不能撞同一缓存键，
    // 否则后到的无墙请求会把全量结果补给被墙用户（缓存污染型静默扩权）
    p.wall ? `W[${p.wall.nodes.join(",")}]` : "", p.groupCode ?? "", p.commodityPath ?? "",
  ].join("|");
}
