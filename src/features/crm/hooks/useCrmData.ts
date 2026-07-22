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
import { useAiMatch } from "./useAiMatch";

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
  const { t } = useLocale();

  // Compose AI matching hook (single responsibility)
  const aiMatch = useAiMatch();

  // Data fetching state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customSuppliers, setCustomSuppliers] = useState<Supplier[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);

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
      aiMatch.setSelectedSupplier(SUPPLIERS[0]);
    }
    if (OPPORTUNITIES.length > 0) {
      aiMatch.setSelectedOpportunity(OPPORTUNITIES[0]);
    }
  }, []);

  // Trigger AI matching (delegates to useAiMatch)
  const triggerAiMatchmaking = async () => {
    if (!aiMatch.selectedSupplier || !aiMatch.selectedOpportunity) {
      alert("Please select a target supplier and opportunity benchmark first!");
      return;
    }
    await aiMatch.triggerMatch(aiMatch.selectedSupplier, aiMatch.selectedOpportunity);
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
    matchSelectedSupplier: aiMatch.selectedSupplier,
    matchSelectedOpportunity: aiMatch.selectedOpportunity,
    isAiMatching: aiMatch.isMatching,
    aiReport: aiMatch.report,
    subscribingOppMessage,
    setMatchSelectedSupplier: aiMatch.setSelectedSupplier,
    setMatchSelectedOpportunity: aiMatch.setSelectedOpportunity,
    triggerAiMatchmaking,
    subscribeOpportunity,
  };
}
