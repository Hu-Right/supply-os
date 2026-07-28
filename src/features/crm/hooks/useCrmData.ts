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
import { useAuth } from "@/core/auth";
import { OPPORTUNITIES } from "@/data";
import { fetchSuppliers } from "@/features/supplier/api";
import type { Lead, Supplier, Opportunity } from "@/types";
import { useAiMatch } from "./useAiMatch";

export type UseCrmDataOptions = {
  /** 跨页跳转带入的供应商：选中并自动触发一次 AI 撮合（对齐原版供应商卡"AI 撮合商机"） */
  autoMatchSupplier?: Supplier | null;
};

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
  subscribeOpportunity: () => void;
  /** 录入线索跟进日志：POST /api/leads/log 并回写 leads，返回更新后的线索 */
  addFollowUpLog: (leadId: string, content: string, nextStatus?: string) => Promise<Lead | null>;
};

/**
 * CRM 数据 Hook
 * CRM Data Hook
 *
 * 从 App.tsx 迁移的 CRM 相关状态和逻辑
 * CRM-related state and logic migrated from App.tsx
 */
export function useCrmData(options: UseCrmDataOptions = {}): UseCrmDataReturn {
  const { autoMatchSupplier } = options;
  const { t, locale } = useLocale();
  const { authUser } = useAuth();

  // Compose AI matching hook (single responsibility)
  const aiMatch = useAiMatch();

  // Data fetching state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [dbSuppliers, setDbSuppliers] = useState<Supplier[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);

  // Subscribe opportunity message
  const [subscribingOppMessage, setSubscribingOppMessage] = useState<string | null>(null);

  // Fetch leads and DB-backed suppliers
  const fetchData = async (preselectFirstSupplier = false) => {
    setIsLoadingLeads(true);
    try {
      const leadsRes = await fetch("/api/leads");
      if (leadsRes.ok) {
        const data = await leadsRes.json();
        setLeads(data);
      }
      const suppliers = await fetchSuppliers(locale).catch(() => [] as Supplier[]);
      setDbSuppliers(suppliers);
      // 首次加载：无跨页带入时默认选中拉取列表首条（列表为空则不预选）
      if (preselectFirstSupplier && !autoMatchSupplier && suppliers.length > 0) {
        aiMatch.setSelectedSupplier(suppliers[0]);
      }
    } catch (e) {
      console.error("Error reading CRM data:", e);
    } finally {
      setIsLoadingLeads(false);
    }
  };

  // Initial data load + default AI match selections
  useEffect(() => {
    fetchData(true);
    // 跨页带入的供应商优先于默认列表首条
    if (autoMatchSupplier) {
      aiMatch.setSelectedSupplier(autoMatchSupplier);
    }
    if (OPPORTUNITIES.length > 0) {
      aiMatch.setSelectedOpportunity(OPPORTUNITIES[0]);
    }
    // 自动执行一次 AI 撮合（商机取默认首条，对齐原版行为）
    if (autoMatchSupplier && OPPORTUNITIES.length > 0) {
      aiMatch.triggerMatch(autoMatchSupplier, OPPORTUNITIES[0]);
    }
  }, []);

  // 展厅/供应商入驻成功后刷新线索池（对齐原版提交成功即 fetchData 的行为）
  useEffect(() => {
    const onCrmRefresh = () => {
      fetchData();
    };
    window.addEventListener("supply-os:crm-refresh", onCrmRefresh);
    return () => window.removeEventListener("supply-os:crm-refresh", onCrmRefresh);
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
  const subscribeOpportunity = () => {
    setSubscribingOppMessage(t("subscribeOppSuccess"));
    setTimeout(() => {
      setSubscribingOppMessage(null);
    }, 4000);
  };

  // Add follow-up log: persist to backend then write back into leads list
  const addFollowUpLog = async (
    leadId: string,
    content: string,
    nextStatus?: string,
  ): Promise<Lead | null> => {
    if (!content.trim()) return null;
    try {
      const res = await fetch("/api/leads/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          content,
          author: authUser?.email ? `运营经理 (${authUser.email})` : "Operator",
          nextStatus,
        }),
      });
      if (!res.ok) return null;
      const updatedLead: Lead = await res.json();
      setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)));
      return updatedLead;
    } catch {
      return null;
    }
  };

  const totalSuppliersList = dbSuppliers;

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
    addFollowUpLog,
  };
}
