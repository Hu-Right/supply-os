/**
 * CRM 数据管理 Hook
 * CRM Data Management Hook
 *
 * @module features/crm/hooks/useCrmData
 * @description 管理 CRM 页面的数据获取、AI 匹配、订阅等逻辑
 *              Manages CRM page data fetching, AI matching, subscription logic
 */

import { useState, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { SUPPLIERS, OPPORTUNITIES } from "@/data";
import type { Lead, Supplier, Opportunity } from "@/types";

export type UseCrmDataReturn = {
  leads: Lead[];
  isLoadingLeads: boolean;
  totalSuppliersList: Supplier[];
  matchSelectedSupplier: Supplier | null;
  matchSelectedOpportunity: Opportunity | null;
  isAiMatching: boolean;
  aiReport: string;
  subscribingOppMessage: string | null;
  setMatchSelectedSupplier: (s: Supplier | null) => void;
  setMatchSelectedOpportunity: (o: Opportunity | null) => void;
  triggerAiMatchmaking: () => Promise<void>;
  subscribeOpportunity: (title: string) => void;
};

/**
 * CRM 数据 Hook
 * CRM Data Hook
 *
 * 从 App.tsx 迁移的 CRM 相关状态和逻辑
 * CRM-related state and logic migrated from App.tsx
 */
export function useCrmData(): UseCrmDataReturn {
  const { t, locale } = useLocale();

  // Data fetching state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customSuppliers, setCustomSuppliers] = useState<Supplier[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);

  // AI Matchmaking state
  const [matchSelectedSupplier, setMatchSelectedSupplier] = useState<Supplier | null>(null);
  const [matchSelectedOpportunity, setMatchSelectedOpportunity] = useState<Opportunity | null>(null);
  const [isAiMatching, setIsAiMatching] = useState(false);
  const [aiReport, setAiReport] = useState("");

  // Subscribe opportunity message
  const [subscribingOppMessage, setSubscribingOppMessage] = useState<string | null>(null);

  // Fetch leads and custom suppliers
  const fetchData = async () => {
    setIsLoadingLeads(true);
    try {
      const leadsRes = await fetch("/api/leads");
      if (leadsRes.ok) {
        const data = await leadsRes.json();
        setLeads(data);
      }
      const supsRes = await fetch("/api/suppliers/custom");
      if (supsRes.ok) {
        const data = await supsRes.json();
        setCustomSuppliers(data);
      }
    } catch (e) {
      console.error("Error reading CRM data:", e);
    } finally {
      setIsLoadingLeads(false);
    }
  };

  // Initial data load + default AI match selections
  useEffect(() => {
    fetchData();
    if (SUPPLIERS.length > 0) {
      setMatchSelectedSupplier(SUPPLIERS[0]);
    }
    if (OPPORTUNITIES.length > 0) {
      setMatchSelectedOpportunity(OPPORTUNITIES[0]);
    }
  }, []);

  // Trigger Gemini AI matching
  const triggerAiMatchmaking = async () => {
    if (!matchSelectedSupplier || !matchSelectedOpportunity) {
      alert("Please select a target supplier and opportunity benchmark first!");
      return;
    }
    setIsAiMatching(true);
    setAiReport("");
    try {
      const response = await fetch("/api/ai/matchmake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: matchSelectedSupplier,
          opportunity: matchSelectedOpportunity,
          language: locale,
        }),
      });
      if (response.ok) {
        const resJson = await response.json();
        setAiReport(resJson.analysis);
      } else {
        setAiReport(t("aiMatchHttpError"));
      }
    } catch {
      setAiReport(t("aiMatchNetworkError"));
    } finally {
      setIsAiMatching(false);
    }
  };

  // Subscribe to opportunity simulation
  const subscribeOpportunity = (_title: string) => {
    setSubscribingOppMessage(t("subscribeOppSuccess"));
    setTimeout(() => {
      setSubscribingOppMessage(null);
    }, 4000);
  };

  const totalSuppliersList = [...customSuppliers, ...SUPPLIERS];

  return {
    leads,
    isLoadingLeads,
    totalSuppliersList,
    matchSelectedSupplier,
    matchSelectedOpportunity,
    isAiMatching,
    aiReport,
    subscribingOppMessage,
    setMatchSelectedSupplier,
    setMatchSelectedOpportunity,
    triggerAiMatchmaking,
    subscribeOpportunity,
  };
}
