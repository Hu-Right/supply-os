/**
 * UNSPSC 类目 API
 * UNSPSC category API
 *
 * @module core/unspsc/api
 * @description UNSPSC 类目获取（跨 auth/procurement/training 模块共用的领域服务）。
 *              自 features/procurement/api 上移；请求统一走 core/http 的 apiCached（5 分钟 TTL）。
 */
import { api, apiCached, buildQuery } from "@/core/http";
import type { UnspscOption, DictionaryItem } from "./types";

/** 智能推断结果：完整 UNSPSC 路径（L1→L5）+ 匹配标题 */
export interface SmartInferResult {
  level1_id: number | null;
  level2_id: number | null;
  level3_id: number | null;
  level4_id: number | null;
  level5_id: number | null;
  matched_title: string | null;
}

/** 智能推断候选：完整路径 + 置信度（0~1），供用户从多个候选中确认选择 */
export interface SmartInferCandidate extends SmartInferResult {
  node_id: number;
  node_level: number;
  /** 置信度 0~1：>= 0.8 高、>= 0.6 中、其余为低（低置信不允许自动填充） */
  score: number;
}

// 需要向后端请求译文的界面语言（zh/en 直接用类目表原列，不传 lang）
const UNSPSC_API_LANGS = new Set(["fr", "ru", "es", "ar"]);

/** 认证列表（准静态字典，与类目同属 catalog 域，收敛为唯一实现） */
export const fetchCertifications = () => api<DictionaryItem[]>("/api/certifications");

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

/** 智能推断 UNSPSC 类目：输入主营业务关键词。
 *  result：置信度 >= 0.6 的最优路径（可自动填充）；null 表示需用户从候选中确认。
 *  candidates：按置信度降序的候选列表（最多 5 条）。 */
export const fetchSmartInferUnspsc = (q: string) =>
  apiCached<{ result: SmartInferResult | null; candidates: SmartInferCandidate[] }>(
    `/api/unspsc/smart-infer?q=${encodeURIComponent(q)}`,
  );
