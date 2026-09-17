/**
 * AI 拆标摘要数据 Hook v2
 * @module features/procurement/hooks/useAiAnalysis
 * @description 流式拉取 AI 摘要（SSE 逐 token）。noticeId 变化自动触发。
 *              缓存命中时一次性填充；未命中时逐字流式渲染。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  streamAiSummary, fetchLlmConfig,
  type AiSummaryData,
} from "../api/ai-summary";

export interface UseAiAnalysisReturn {
  data: AiSummaryData | null;
  loading: boolean;
  streaming: boolean;
  error: string | null;
  cached: boolean;
  llmConfigured: boolean;
  triggerAnalysis: (forceRegenerate?: boolean) => void;
}

/** 尝试从累积文本中解析出 6 维度 JSON */
function tryParsePartialJson(text: string): Partial<AiSummaryData> {
  const result: Partial<AiSummaryData> = {};
  const keys: (keyof AiSummaryData)[] = [
    "coreDeliverables", "keyQualifications", "paymentAndCycle",
    "competitiveLandscape", "bidStrategy", "riskAlerts",
  ];
  for (const key of keys) {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g");
    let m: RegExpExecArray | null;
    let val = "";
    while ((m = re.exec(text)) !== null) val = m[1];
    if (val) result[key] = val.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
  return result;
}

export function useAiAnalysis(
  noticeId: number | undefined,
  isLoggedIn: boolean,
): UseAiAnalysisReturn {
  const [data, setData] = useState<AiSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const abortRef = useRef(false);

  const run = useCallback(async (id: number, _force: boolean) => {
    if (abortRef.current) return;
    setLoading(true);
    setStreaming(true);
    setError(null);
    setData(null);
    setCached(false);

    let accumulated = "";

    try {
      await streamAiSummary(
        id,
        // onChunk: 逐文本片段累积 + 实时解析
        (text) => {
          if (abortRef.current) return;
          accumulated += text;
          const partial = tryParsePartialJson(accumulated);
          if (Object.keys(partial).length > 0) {
            setData((prev) => ({ ...prev, ...partial }));
          }
        },
        // onDone: 流结束，解析完整 JSON
        (fullJson) => {
          if (abortRef.current) return;
          try {
            const parsed = JSON.parse(fullJson);
            if (parsed.coreDeliverables !== undefined) {
              setData({
                coreDeliverables: parsed.coreDeliverables,
                keyQualifications: parsed.keyQualifications,
                paymentAndCycle: parsed.paymentCycle,
                competitiveLandscape: parsed.competitiveLandscape,
                bidStrategy: parsed.bidStrategy,
                riskAlerts: parsed.riskAlerts,
              });
              setCached(true);
            }
          } catch {
            // 流式文本无法解析为 JSON，保留已累积的 partial
          }
          setStreaming(false);
          setLoading(false);
        },
        // onError
        (msg) => {
          if (abortRef.current) return;
          setError(msg);
          setStreaming(false);
          setLoading(false);
        },
      );
    } catch (err) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : "AI 分析失败");
        setStreaming(false);
        setLoading(false);
      }
    }
  }, []);

  // 进入详情：仅检查 LLM 配置状态，不自动触发分析（由用户手动点击开始）
  useEffect(() => {
    abortRef.current = false;
    if (!noticeId || !isLoggedIn) {
      setData(null); setLlmConfigured(false); setLoading(false); setStreaming(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchLlmConfig();
        if (cancelled) return;
        setLlmConfigured(!!cfg.data?.configured);
      } catch {
        if (!cancelled) setLlmConfigured(false);
      }
    })();
    return () => { cancelled = true; abortRef.current = true; };
  }, [noticeId, isLoggedIn]);

  const triggerAnalysis = useCallback((force = false) => {
    if (!noticeId) return;
    abortRef.current = false;
    void run(noticeId, force);
  }, [noticeId, run]);

  return { data, loading, streaming, error, cached, llmConfigured, triggerAnalysis };
}
