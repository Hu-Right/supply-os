/**
 * CRM 页面
 * CRM Page
 *
 * @module features/crm/pages/CrmPage
 * @description CRM 页面入口，组合统计卡片、商机列表、AI 匹配、线索追踪
 *              CRM page entry, composing StatsCards, OpportunityList, AiMatchmaker, LeadTracker
 */

import { useLocale } from "@/core/i18n";
import { useLocation } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import type { Supplier } from "@/types";
import { useCrmData } from "../hooks/useCrmData";
import { StatsCards } from "../components/StatsCards";
import { OpportunityList } from "../components/OpportunityList";
import { AiMatchmaker } from "../components/AiMatchmaker";
import { LeadTracker } from "../components/LeadTracker";

export default function CrmPage() {
  const { t } = useLocale();
  // 供应商页"AI 撮合商机"跳转时通过路由 state 带入目标供应商，挂载后自动撮合
  const location = useLocation();
  const autoMatchSupplier =
    (location.state as { aiMatchSupplier?: Supplier } | null)?.aiMatchSupplier ?? null;
  const {
    leads,
    isLoadingLeads,
    totalSuppliersList,
    matchSelectedSupplier,
    matchSelectedOpportunity,
    isAiMatching,
    aiReport,
    setMatchSelectedSupplier,
    setMatchSelectedOpportunity,
    triggerAiMatchmaking,
    subscribeOpportunity,
    subscribingOppMessage,
    addFollowUpLog,
  } = useCrmData({ autoMatchSupplier });

  return (
    <div className="space-y-6">
      {subscribingOppMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-700 animate-bounce">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {subscribingOppMessage}
        </div>
      )}

      <StatsCards
        leads={leads}
        labels={{
          leadCount: t("leadCount"),
          oppCount: t("oppCount"),
          clientPool: t("clientPool"),
          followUpHistory: t("crmFollowUpHistory"),
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Opportunities & AI Matchmaking */}
        <div className="lg:col-span-6 space-y-6">
          <OpportunityList
            selectedOpportunity={matchSelectedOpportunity}
            onSelect={setMatchSelectedOpportunity}
            onSubscribe={subscribeOpportunity}
            labels={{
              opportunityHub: t("opportunityHub"),
              latestNotices: t("crmLatestNotices"),
              subscribe: t("opportunitySubscribe"),
            }}
            deadlineLabel={(deadline) => t("opportunityDeadline", { deadline })}
          />

          <AiMatchmaker
            suppliers={totalSuppliersList}
            selectedSupplier={matchSelectedSupplier}
            selectedOpportunity={matchSelectedOpportunity}
            isMatching={isAiMatching}
            report={aiReport}
            onSelectSupplier={setMatchSelectedSupplier}
            onSelectOpportunity={setMatchSelectedOpportunity}
            onTrigger={triggerAiMatchmaking}
            labels={{
              title: t("aiMatchmaking"),
              description: "基于 Gemini-3.5-flash 与多语言资质智能比对",
              selectSupplier: "所选出海企业 (Supplier)",
              selectOpportunity: "特定标讯商机 (Opportunity)",
              analyzing: t("aiAnalyzing"),
              trigger: t("clickAiMatch"),
              resultTitle: t("aiMatchingResult"),
              resultBadge: "GEMINI PROMPT REPORT",
            }}
          />
        </div>

        {/* Right Column: Lead Tracker */}
        <div className="lg:col-span-6">
          <LeadTracker
            leads={leads}
            isLoading={isLoadingLeads}
            onSubmitLog={addFollowUpLog}
            labels={{
              title: t("leadTracker"),
              badge: "REALTIME INGESTED",
              description: t("crmLeadDesc"),
              loadingLeads: t("crmLoadingLeads"),
              fieldIndustry: t("crmFieldIndustry"),
              fieldCountry: t("crmFieldCountry"),
              fieldContact: t("crmFieldContact"),
              fieldMethod: t("crmFieldMethod"),
              fieldNotes: t("crmFieldNotes"),
              industryUnknown: t("crmIndustryUnknown"),
              followUpCount: (num: number) => t("crmFollowUpCount", { num }),
              editingLead: (company: string) => t("crmEditingLead", { company }),
              followUpLogs: t("followUpLogs"),
              noLogs: "暂无联络节点，快在下方录入首个转化里程碑。",
              logPlaceholder: t("crmLogPlaceholder"),
              leadPhase: t("crmLeadPhase"),
              saveToCRM: t("crmSaveToCRM"),
              saveFailed: t("crmSaveToCRMFailed"),
            }}
          />
        </div>
      </div>
    </div>
  );
}
