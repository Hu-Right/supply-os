/**
 * AI 适配评分数据 Hook
 * @module features/procurement/hooks/useAiScore
 * @description 手动触发评分（用户点击按钮），缓存优先。
 */
import { useCallback, useState } from "react";
import { fetchAiScore, type AiScoreData } from "../api/ai-score";
import { classifyApiError, type ErrorClassification } from "@/core/http";

export interface UseAiScoreReturn {
  data: AiScoreData | null;
  loading: boolean;
  error: ErrorClassification | null;
  triggerScore: (forceRegenerate?: boolean) => void;
}

export function useAiScore(noticeId: number | undefined): UseAiScoreReturn {
  const [data, setData] = useState<AiScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorClassification | null>(null);

  const triggerScore = useCallback((force = false) => {
    if (!noticeId) return;
    setLoading(true);
    setError(null);
    fetchAiScore(noticeId, force)
      .then((d) => setData(d))
      .catch((err) => setError(classifyApiError(err)))
      .finally(() => setLoading(false));
  }, [noticeId]);

  return { data, loading, error, triggerScore };
}
