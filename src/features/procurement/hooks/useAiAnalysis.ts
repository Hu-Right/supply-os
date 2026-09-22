/**
 * AI 拆标摘要数据 Hook v2
 * @module features/procurement/hooks/useAiAnalysis
 * @description 流式拉取 AI 摘要（SSE 逐 token）。noticeId 变化自动触发。
 *              缓存命中时一次性填充；未命中时逐字流式渲染。
 *              锁定态（isUnlocked=false）不发任何请求：AI 摘要端点强制"登录+解锁"，
 *              锁定必 403 core_locked（与 useNoticeTranslation 的 ARCH-P0 处理一致）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  streamAiSummary, fetchLlmConfig, fetchAiSummaryCache,
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
  /** 公告是否已解锁：未解锁时不加载缓存、不开放分析（后端必 403 core_locked） */
  isUnlocked = true,
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
        // onDone: 流结束，解析完整 JSON；失败时降级部分解析，再失败报友好错误（不静默）
        (fullJson) => {
          if (abortRef.current) return;
          let ok = false;
          try {
            const parsed = JSON.parse(fullJson);
            // 要求 coreDeliverables 有实际内容才算成功；空字符串视为无效（避免"一闪而过"无反馈）
            if (parsed.coreDeliverables !== undefined && String(parsed.coreDeliverables || "").trim()) {
              setData({
                coreDeliverables: parsed.coreDeliverables,
                keyQualifications: parsed.keyQualifications,
                paymentAndCycle: parsed.paymentCycle,
                competitiveLandscape: parsed.competitiveLandscape,
                bidStrategy: parsed.bidStrategy,
                riskAlerts: parsed.riskAlerts,
              });
              setCached(true);
              ok = true;
            }
          } catch { /* 落入降级 */ }
          if (!ok) {
            // 降级：尝试从累积文本中提取已完成的字段
            const partial = tryParsePartialJson(fullJson);
            if (Object.keys(partial).length > 0) {
              setData(partial as AiSummaryData);
              ok = true;
            }
          }
          if (!ok) {
            setError(fullJson ? "AI 返回格式异常，请重试" : "AI 未返回内容，请重试");
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

  // 进入详情：检查 LLM 配置 + 自动加载历史缓存（有缓存直接展示，无缓存才显示开始按钮）
  // 锁定态直接复位并早退：不发 llm-config/缓存请求，避免必败的 403 core_locked
  useEffect(() => {
    abortRef.current = false;
    if (!noticeId || !isLoggedIn || !isUnlocked) {
      setData(null); setLlmConfigured(false); setLoading(false); setStreaming(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchLlmConfig();
        if (cancelled) return;
        setLlmConfigured(!!cfg.data?.configured);
        // 自动加载历史缓存（不触发生成）
        const cachedData = await fetchAiSummaryCache(noticeId);
        if (cancelled) return;
        if (cachedData) {
          setData({
            coreDeliverables: cachedData.coreDeliverables,
            keyQualifications: cachedData.keyQualifications,
            paymentAndCycle: cachedData.paymentCycle,
            competitiveLandscape: cachedData.competitiveLandscape,
            bidStrategy: cachedData.bidStrategy,
            riskAlerts: cachedData.riskAlerts,
          });
          setCached(true);
        }
      } catch {
        if (!cancelled) setLlmConfigured(false);
      }
    })();
    return () => { cancelled = true; abortRef.current = true; };
  }, [noticeId, isLoggedIn, isUnlocked]);

  const triggerAnalysis = useCallback((force = false) => {
    if (!noticeId || !isUnlocked) return;
    abortRef.current = false;
    void run(noticeId, force);
  }, [noticeId, isUnlocked, run]);

  return { data, loading, streaming, error, cached, llmConfigured, triggerAnalysis };
}
