/**
 * AI 适配评分前端 API
 * @module features/procurement/api/ai-score
 */
import { api, getAuthToken } from "@/core/http";

export interface AiScoreData {
  qualification: number;
  experience: number;
  certification: number;
  region: number;
  scale: number;
  delivery: number;
  price: number;
  overall: number;
  reasons: Record<string, string>;
  cached: boolean;
}

/** 获取/生成 AI 适配评分 */
export async function fetchAiScore(
  noticeId: number,
  forceRegenerate = false,
): Promise<AiScoreData> {
  const authToken = getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(`/api/notices/${noticeId}/ai-score`, {
    method: "POST",
    headers,
    credentials: "same-origin",
    body: JSON.stringify({ forceRegenerate }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data as AiScoreData;
}
