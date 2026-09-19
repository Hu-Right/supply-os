/**
 * AI 智能匹配前端 API
 * @module features/procurement/api/ai-match
 */
import { api } from "@/core/http";
import type { DimensionDetail } from "./ai-score";

export interface MatchedSupplier {
  pool_id: number;
  supplier_id: number;
  company: string;
  qualification: number;
  experience: number;
  certification: number;
  region: number;
  scale: number;
  delivery: number;
  price: number;
  overall: number;
  details: Record<string, DimensionDetail>;
  reasoning: string;
}

export interface AiMatchData {
  top: MatchedSupplier[];
  cached: boolean;
  /** 资源库供应商总数（缓存命中时等于 top 数量） */
  poolSize: number;
  /** 本次实际送入 LLM 评估的数量 */
  evaluated: number;
  /** 评估失败的数量（>0 且 top 为空 = 全部失败） */
  failed: number;
  /** 资源库中缺诊断资料的工厂数（补全提示） */
  diagPending: number;
}

/** GET 回读匹配缓存（不触发生成、不消耗 LLM）；无缓存返回 { cached: false } */
export async function fetchAiMatchCache(
  noticeId: number,
): Promise<{ cached: boolean; top?: MatchedSupplier[]; diagPending: number }> {
  return api<{ cached: boolean; top?: MatchedSupplier[]; diagPending: number }>(
    `/api/notices/${noticeId}/ai-match`,
  );
}

/** 触发 AI 智能匹配（POST；手动触发，缓存优先） */
export async function fetchAiMatch(
  noticeId: number,
  forceRegenerate = false,
): Promise<AiMatchData> {
  return api<AiMatchData>(`/api/notices/${noticeId}/ai-match`, {
    method: "POST",
    body: { forceRegenerate },
  });
}
