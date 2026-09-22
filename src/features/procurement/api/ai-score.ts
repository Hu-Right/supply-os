/**
 * AI 适配评分前端 API
 * @module features/procurement/api/ai-score
 */
import { api } from "@/core/http";

export interface DimensionDetail {
  reason: string;
  matched: string[];
  gaps: string[];
}

export interface AiScoreData {
  qualification: number;
  experience: number;
  certification: number;
  region: number;
  scale: number;
  delivery: number;
  price: number;
  overall: number;
  details: Record<string, DimensionDetail>;
  /** 思维链推理过程文本 */
  reasoning: string;
  cached: boolean;
}

/** 获取/生成 AI 适配评分（走 api()：失败抛 ApiError，携业务码供区分档位闸门 vs 解锁闸门） */
export async function fetchAiScore(
  noticeId: number,
  forceRegenerate = false,
): Promise<AiScoreData> {
  const res = await api<{ code: number; data: AiScoreData }>(`/api/notices/${noticeId}/ai-score`, {
    method: "POST",
    body: { forceRegenerate },
  });
  return res.data;
}
