/**
 * AI投标工作台/CRM 页面 — 容器组件
 * AI Bidding Workspace / CRM Page — Container
 *
 * @module features/crm/pages/CrmPage
 * @description D4-2 容器/展示分离重构：CrmPage 仅编排子组件顺序，
 *              不含静态数据和内联 UI。子组件：CrmSidebar / CrmFunnelChart /
 *              CrmFeatureCards / DigitalAssistant + 内联统计卡/AI评估区。
 */
import { useState, useEffect } from "react";
import {
  Briefcase, Clock, CheckSquare, TrendingUp,
  Info,
} from "lucide-react";
import type { Supplier } from "@/types";
import { useLocale } from "@/core/i18n";
import { useCrmData } from "../hooks/useCrmData";
import { DigitalAssistant } from "../components/DigitalAssistant/DigitalAssistant";
import { CrmSidebar } from "../components/CrmSidebar";
import { CrmFunnelChart } from "../components/CrmFunnelChart";
import { CrmFeatureCards } from "../components/CrmFeatureCards";

const STAT_CARDS = [
  { value: "23", labelKey: "crmStatMatchedOpps", subKey: "crmStatMatchedDelta", icon: Briefcase, color: "text-teal-600", bg: "bg-teal-50" },
  { value: "7", labelKey: "crmStatDeadlineWeek", subKey: "crmStatDeadlineDelta", icon: Clock, color: "text-rose-600", bg: "bg-rose-50" },
  { value: "5", labelKey: "crmStatPendingTasks", subKey: "crmStatTasksDelta", icon: CheckSquare, color: "text-amber-600", bg: "bg-amber-50" },
  { value: "82%", labelKey: "crmStatProfileCompleteness", subKey: "crmStatProfileDelta", icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
];

const BID_OUTPUT_TAGS = [
  { tagKey: "crmBidOutputHitRate" },
  { tagKey: "crmBidOutputGaps" },
  { tagKey: "crmBidOutputRisks" },
  { tagKey: "crmBidOutputActions" },
  { tagKey: "crmBidOutputWinRate" },
];

export default function CrmPage() {
  const { t } = useLocale();
  const [activeNav, setActiveNav] = useState("overview");
  const [autoMatchSupplier, setAutoMatchSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("__route_state__");
      if (raw) {
        const state = JSON.parse(raw);
        sessionStorage.removeItem("__route_state__");
        setAutoMatchSupplier(state?.aiMatchSupplier ?? null);
      }
    } catch { /* ignore */ }
  }, []);

  const {
    leads,
    totalSuppliersList,
    isAiMatching,
    aiReport,
    triggerAiMatchmaking,
  } = useCrmData({ autoMatchSupplier });

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* ═══ 左侧导航栏 ═══ */}
      <CrmSidebar activeNav={activeNav} onNavChange={setActiveNav} />

      {/* ═══ 主内容区 ═══ */}
      <main className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* 顶部4统计卡 */}
        <div className="grid grid-cols-4 gap-4">
          {STAT_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.labelKey} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-3xl font-extrabold text-slate-900">{card.value}</p>
                    <p className="text-sm font-bold text-slate-700 mt-1">{t(card.labelKey)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{t(card.subKey)}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 双栏：商机漏斗 + AI Bid/No-Bid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CrmFunnelChart />

          {/* 右：AI Bid / No-Bid */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">AI Bid / No-Bid</h3>
              <button className="text-xs text-slate-400 flex items-center gap-1">
                <Info className="w-3 h-3" /> {t("crmBidGuide")}
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              {t("crmBidDesc")}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">{t("crmBidSelectCompany")}</label>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 outline-none">
                  <option>{t("crmBidSelectCompanyPlaceholder")}</option>
                  {totalSuppliersList.map((s) => (
                    <option key={s.id} value={s.id}>{s.nameZh || s.nameEn || s.id}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">{t("crmBidSelectOpportunity")}</label>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 outline-none">
                    <option>{t("crmBidSelectOppPlaceholder")}</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>{l.companyName || l.id}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => triggerAiMatchmaking()}
                  disabled={isAiMatching}
                  className="self-end bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap"
                >
                  {isAiMatching ? t("crmBidEvaluating") : t("crmBidEvaluateNow")}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-xs text-slate-500">{t("crmBidOutputLabel")}</span>
                {BID_OUTPUT_TAGS.map(({ tagKey }) => (
                  <span key={tagKey} className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-2xs font-bold text-teal-700">
                    {t(tagKey)}
                  </span>
                ))}
              </div>
            </div>
            {aiReport && (
              <div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-xs font-bold text-slate-700 mb-2">{t("crmBidReportTitle")}</p>
                <pre className="text-xs text-slate-600 whitespace-pre-wrap">{JSON.stringify(aiReport, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>

        {/* 底部4功能卡 */}
        <CrmFeatureCards />

        {/* Digital Assistant — 保留原有AI对话功能 */}
        <DigitalAssistant />
      </main>
    </div>
  );
}

CrmPage.displayName = "CrmPage";
