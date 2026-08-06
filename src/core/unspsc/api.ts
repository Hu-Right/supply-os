/**
 * UNSPSC 类目 API
 * UNSPSC category API
 *
 * @module core/unspsc/api
 * @description UNSPSC 类目获取（跨 auth/procurement/training 模块共用的领域服务）。
 *              自 features/procurement/api 上移；请求统一走 core/http 的 apiCached（5 分钟 TTL）。
 */
import { apiCached, buildQuery } from "@/core/http";
import type { UnspscOption } from "./types";

/** 智能推断结果：完整 UNSPSC 路径（L1→L5）+ 匹配标题 */
export interface SmartInferResult {
  level1_id: number | null;
  level2_id: number | null;
  level3_id: number | null;
  level4_id: number | null;
  level5_id: number | null;
  matched_title: string | null;
}

// 需要向后端请求译文的界面语言（zh/en 直接用类目表原列，不传 lang）
const UNSPSC_API_LANGS = new Set(["fr", "ru", "es", "ar"]);

export const fetchUnspscIndustries = (locale?: string) => {
  const lang = locale && UNSPSC_API_LANGS.has(locale) ? `?lang=${encodeURIComponent(locale)}` : "";
  return apiCached<UnspscOption[]>(`/api/unspsc/industries${lang}`);
};

export const fetchUnspscChildren = (parentId: string, locale?: string) => {
  const qs = buildQuery({
    parent_id: parentId,
    lang: locale && UNSPSC_API_LANGS.has(locale) ? locale : undefined,
  });
  return apiCached<UnspscOption[]>(`/api/unspsc/children?${qs}`);
};

/** 智能推断 UNSPSC 类目：输入主营业务关键词，返回最佳匹配的完整路径 */
export const fetchSmartInferUnspsc = (q: string) =>
  apiCached<{ result: SmartInferResult | null }>(`/api/unspsc/smart-infer?q=${encodeURIComponent(q)}`);
