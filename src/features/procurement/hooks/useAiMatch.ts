/**
 * AI 智能匹配数据 Hook
 * @module features/procurement/hooks/useAiMatch
 * @description 进详情页先 GET 回读历史匹配缓存（不消耗 LLM）；用户点击后 POST
 *              触发匹配（缓存优先，forceRegenerate 强制重新匹配）。
 */
import { useCallback, useEffect, useState } from "react";
import { fetchAiMatch, fetchAiMatchCache, type AiMatchData } from "../api/ai-match";
import { gateErrorToken } from "../api/notice-gate";

export interface UseAiMatchReturn {
  data: AiMatchData | null;
  loading: boolean;
  /** 历史缓存回读中（true 时卡片显示骨架屏而非引导按钮，避免闪烁） */
  cacheLoading: boolean;
  error: string | null;
  triggerMatch: (forceRegenerate?: boolean) => void;
}

export function useAiMatch(noticeId: number | undefined, entitled = true): UseAiMatchReturn {
  const [data, setData] = useState<AiMatchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 进页面回读缓存：命中则直接呈现历史匹配结果，未命中保持引导态
  // 无 ai_match 权益（低档走法②）时不发缓存请求，避免"点了才 403"
  useEffect(() => {
    if (!noticeId || !entitled) return;
    let cancelled = false;
    setCacheLoading(true);
    fetchAiMatchCache(noticeId)
      .then((res) => {
        if (cancelled) return;
        if (res.cached && res.top) {
          setData({
            top: res.top, cached: true,
            poolSize: res.top.length, evaluated: res.top.length, failed: 0,
            diagPending: res.diagPending,
          });
        }
      })
      .catch(() => { /* 回读失败保持引导态，用户点击时仍会走 POST */ })
      .finally(() => { if (!cancelled) setCacheLoading(false); });
    return () => { cancelled = true; };
  }, [noticeId, entitled]);

  const triggerMatch = useCallback((force = false) => {
    if (!noticeId || !entitled) return;
    setLoading(true);
    setError(null);
    fetchAiMatch(noticeId, force)
      .then((d) => setData(d))
      .catch((err) => setError(gateErrorToken(err)))
      .finally(() => setLoading(false));
  }, [noticeId, entitled]);

  return { data, loading, cacheLoading, error, triggerMatch };
}
