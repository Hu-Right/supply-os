/**
 * AI 智能匹配 Hook
 * AI Matchmaking Hook
 *
 * @module features/crm/hooks/useAiMatch
 * @description 从 useCrmData 拆分的纯 AI 匹配职责
 *              Pure AI matching logic extracted from useCrmData
 */

import { useState } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import type { Supplier, Opportunity } from "@/types";

export type UseAiMatchReturn = {
  /** AI 分析报告 */
  report: string;
  /** 是否正在匹配 */
  isMatching: boolean;
  /** 当前选中的供应商 */
  selectedSupplier: Supplier | null;
  /** 当前选中的商机 */
  selectedOpportunity: Opportunity | null;
  /** 设置选中供应商 */
  setSelectedSupplier: (s: Supplier | null) => void;
  /** 设置选中商机 */
  setSelectedOpportunity: (o: Opportunity | null) => void;
  /** 触发 AI 匹配 */
  triggerMatch: (supplier: Supplier, opportunity: Opportunity) => Promise<void>;
};

/**
 * AI 匹配 Hook
 * AI Matchmaking Hook
 *
 * 管理供应商与商机的 AI 智能比对逻辑
 * Manages supplier-opportunity AI matching logic
 */
export function useAiMatch(): UseAiMatchReturn {
  const { t, locale } = useLocale();

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [report, setReport] = useState("");

  /**
   * 触发 Gemini AI 匹配
   * Trigger Gemini AI matchmaking
   */
  const triggerMatch = async (supplier: Supplier, opportunity: Opportunity) => {
    setIsMatching(true);
    setReport("");
    try {
      // 双轨制退役（轨道C）：统一走 api() 请求层（指标采集 + 统一错误语义）
      const resJson = await api<{ analysis?: string }>("/api/ai/matchmake", {
        method: "POST",
        body: {
          supplier,
          opportunity,
          language: locale,
        },
      });
      setReport(resJson.analysis ?? "");
    } catch {
      // 非 2xx 与网络异常统一降级提示（原实现区分两种错误，此处合并为网络错误文案）
      setReport(t("aiMatchNetworkError"));
    } finally {
      setIsMatching(false);
    }
  };

  return {
    report,
    isMatching,
    selectedSupplier,
    selectedOpportunity,
    setSelectedSupplier,
    setSelectedOpportunity,
    triggerMatch,
  };
}
