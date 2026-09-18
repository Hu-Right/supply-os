/**
 * AI 智能匹配数据 Hook
 * @module features/procurement/hooks/useAiMatch
 * @description 手动触发匹配（用户点击按钮），缓存优先。
 */
import { useCallback, useState } from "react";
import { fetchAiMatch, type AiMatchData } from "../api/ai-match";

export interface UseAiMatchReturn {
  data: AiMatchData | null;
  loading: boolean;
  error: string | null;
  triggerMatch: (forceRegenerate?: boolean) => void;
}

export function useAiMatch(noticeId: number | undefined): UseAiMatchReturn {
  const [data, setData] = useState<AiMatchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerMatch = useCallback((force = false) => {
    if (!noticeId) return;
    setLoading(true);
    setError(null);
    fetchAiMatch(noticeId, force)
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "匹配失败"))
      .finally(() => setLoading(false));
  }, [noticeId]);

  return { data, loading, error, triggerMatch };
}
