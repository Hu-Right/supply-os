/**
 * AI 拆标摘要数据 Hook
 * @module features/procurement/hooks/useAiAnalysis
 * @description 拉取用户 LLM 配置状态 + 公告 AI 摘要。noticeId 变化自动触发。
 *              triggerAnalysis(true) 强制重新分析。错误态不阻塞页面其他渲染。
 */
import { useCallback, useEffect, useState } from "react";
import {
  generateAiSummary, fetchLlmConfig,
  type AiSummaryData,
} from "../api/ai-summary";

export interface UseAiAnalysisReturn {
  data: AiSummaryData | null;
  loading: boolean;
  error: string | null;
  cached: boolean;
  llmConfigured: boolean;
  triggerAnalysis: (forceRegenerate?: boolean) => void;
}

export function useAiAnalysis(
  noticeId: number | undefined,
  isLoggedIn: boolean,
): UseAiAnalysisReturn {
  const [data, setData] = useState<AiSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [llmConfigured, setLlmConfigured] = useState(false);

  const run = useCallback(async (id: number, force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateAiSummary(id, force);
      const d = res.data;
      setData({
        coreDeliverables: d.coreDeliverables,
        keyQualifications: d.keyQualifications,
        paymentAndCycle: d.paymentCycle,
        riskAlerts: d.riskAlerts,
      });
      setCached(d.cached);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "AI 分析失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // 进入详情：先查配置，已配置则拉摘要（缓存优先）
  useEffect(() => {
    if (!noticeId || !isLoggedIn) {
      setData(null); setLlmConfigured(false); setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchLlmConfig();
        if (cancelled) return;
        const configured = !!cfg.data?.configured;
        setLlmConfigured(configured);
        if (configured) await run(noticeId, false);
      } catch {
        if (!cancelled) setLlmConfigured(false);
      }
    })();
    return () => { cancelled = true; };
  }, [noticeId, isLoggedIn, run]);

  const triggerAnalysis = useCallback((force = false) => {
    if (!noticeId) return;
    void run(noticeId, force);
  }, [noticeId, run]);

  return { data, loading, error, cached, llmConfigured, triggerAnalysis };
}
