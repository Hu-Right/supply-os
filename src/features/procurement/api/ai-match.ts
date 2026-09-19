/**
 * AI 智能匹配前端 API
 * @module features/procurement/api/ai-match
 */
import { getAuthToken } from "@/core/http";
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
}

/** 触发 AI 智能匹配 */
export async function fetchAiMatch(
  noticeId: number,
  forceRegenerate = false,
): Promise<AiMatchData> {
  const authToken = getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(`/api/notices/${noticeId}/ai-match`, {
    method: "POST",
    headers,
    credentials: "same-origin",
    body: JSON.stringify({ forceRegenerate }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as AiMatchData;
}
