/**
 * AI 适配评分数据 Hook
 * @module features/procurement/hooks/useAiScore
 * @description 手动触发评分（用户点击按钮），缓存优先。
 */
import { useCallback, useState } from "react";
import { fetchAiScore, type AiScoreData } from "../api/ai-score";
import { gateErrorToken } from "../api/notice-gate";

export interface UseAiScoreReturn {
  data: AiScoreData | null;
  loading: boolean;
  error: string | null;
  triggerScore: (forceRegenerate?: boolean) => void;
}

export function useAiScore(noticeId: number | undefined): UseAiScoreReturn {
  const [data, setData] = useState<AiScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerScore = useCallback((force = false) => {
    if (!noticeId) return;
    setLoading(true);
    setError(null);
    fetchAiScore(noticeId, force)
      .then((d) => setData(d))
      .catch((err) => setError(gateErrorToken(err)))
      .finally(() => setLoading(false));
  }, [noticeId]);

  return { data, loading, error, triggerScore };
}
