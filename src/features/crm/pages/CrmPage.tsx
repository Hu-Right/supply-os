import { useState } from "react";
import { Activity, Clock, Sparkles, TrendingUp, Users, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { OPPORTUNITIES } from "@/data";
import type { Lead } from "@/types";
import { useCrmData } from "../hooks/useCrmData";

export default function CrmPage() {
  const { t, locale } = useLocale();
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
  } = useCrmData();

  const [activeLeadForLog, setActiveLeadForLog] = useState<Lead | null>(null);
  const [newCrmLogEntry, setNewCrmLogEntry] = useState<string>("");
  const [crmLogStatus, setCrmLogStatus] = useState<string>("");

  const handleSubmitLog = (e: React.FormEvent) => {
    e.preventDefault();
    // CRM follow-up log is managed locally within CrmPage
    setNewCrmLogEntry("");
    setCrmLogStatus("");
  };

  return (
    <div className="space-y-6">
      {/* Top metrics tracker */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: t("leadCount"), val: leads.length, icon: Activity, col: "text-teal-600 bg-teal-50" },
          { title: t("oppCount"), val: OPPORTUNITIES.length, icon: TrendingUp, col: "text-indigo-600 bg-indigo-50" },
          {
            title: t("clientPool"),
            val: leads.filter((l) => l.status === "qualified" || l.status === "contacted").length,
            icon: Users,
            col: "text-emerald-600 bg-emerald-50",
          },
          {
            title: t("crmFollowUpHistory"),
            val: leads.reduce((acc, current) => acc + (current.followUpLogs?.length || 0), 0),
            icon: Clock,
            col: "text-amber-600 bg-amber-50",
          },
        ].map((m, idx) => {
          const Icon = m.icon;
          return (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
              <p className="text-xs text-slate-400 font-semibold">{m.title}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-2xl font-black text-slate-800">{m.val}</span>
                <div className={`p-2 rounded-lg ${m.col}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main CRM Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Opportunities & AI Matchmaking */}
        <div className="lg:col-span-6 space-y-6">
          {/* 1. Smart Outbound Opportunities Hub */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <h3 className="text-base font-extrabold text-slate-800 mb-4 flex items-center justify-between">
              <span>{t("opportunityHub")}</span>
              <span className="text-xs text-teal-600 font-mono">{t("crmLatestNotices")}</span>
            </h3>
            <div className="space-y-4">
              {OPPORTUNITIES.map((opp) => (
                <div
                  key={opp.id}
                  onClick={() => setMatchSelectedOpportunity(opp)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    matchSelectedOpportunity?.id === opp.id
                      ? "bg-gradient-to-tr from-slate-50 to-teal-55/15 border-teal-500 shadow-sm"
                      : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="bg-indigo-100 text-indigo-800 text-[9px] px-2 py-0.5 rounded font-bold uppercase">
                      {locale === "zh" ? opp.industryZh : opp.industryEn}
                    </span>
                    <span className="text-xs font-semibold text-teal-700">{opp.budget}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 mt-2 line-clamp-1">
                    {locale === "zh" ? opp.titleZh : opp.titleEn}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {locale === "zh" ? opp.descriptionZh : opp.descriptionEn}
                  </p>
                  <div className="mt-3 flex justify-between items-center border-t border-slate-200/50 pt-2 text-[11px] text-slate-400">
                    <span>{t("opportunityDeadline", { deadline: opp.deadline })}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        subscribeOpportunity(opp.titleZh);
                      }}
                      className="bg-slate-900 text-white px-2 py-1 rounded hover:bg-slate-800 font-bold"
                    >
                      {t("opportunitySubscribe")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. AI Smart Matchmaking */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-slate-100 rounded-2xl p-5 border border-slate-900 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="bg-teal-500 text-slate-900 p-1.5 rounded-lg">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-teal-400">{t("aiMatchmaking")}</h3>
                  <p className="text-[11px] text-slate-400">基于 Gemini-3.5-flash 与多语言资质智能比对</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">1. 所选出海企业 (Supplier)</span>
                <select
                  value={matchSelectedSupplier ? matchSelectedSupplier.id : ""}
                  onChange={(e) => {
                    const found = totalSuppliersList.find((x) => x.id === e.target.value);
                    if (found) setMatchSelectedSupplier(found);
                  }}
                  className="bg-slate-700 text-white rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  {totalSuppliersList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {locale === "zh" ? s.nameZh : s.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">2. 特定标讯商机 (Opportunity)</span>
                <select
                  value={matchSelectedOpportunity ? matchSelectedOpportunity.id : ""}
                  onChange={(e) => {
                    const found = OPPORTUNITIES.find((x) => x.id === e.target.value);
                    if (found) setMatchSelectedOpportunity(found);
                  }}
                  className="bg-slate-700 text-white rounded px-2 py-1 max-w-[200px] truncate focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  {OPPORTUNITIES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {locale === "zh" ? o.titleZh : o.titleEn}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={triggerAiMatchmaking}
                disabled={isAiMatching}
                className="w-full py-2.5 mt-2 bg-teal-500 text-slate-955 rounded-lg text-xs font-bold hover:bg-teal-400 transition-colors disabled:opacity-50 cursor-pointer text-center text-slate-900"
              >
                {isAiMatching ? t("aiAnalyzing") : t("clickAiMatch")}
              </button>
            </div>

            {aiReport && (
              <div className="mt-4 p-4 rounded-xl bg-slate-800 border border-slate-700/60 text-xs max-h-80 overflow-y-auto leading-relaxed scrollbar-thin">
                <div className="flex justify-between items-center border-b border-slate-750 pb-1.5 mb-2.5">
                  <span className="font-extrabold text-teal-400">{t("aiMatchingResult")}</span>
                  <span className="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono text-[9px] uppercase">
                    GEMINI PROMPT REPORT
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-slate-300 prose prose-invert font-sans space-y-2">
                  {aiReport}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Leads pool & CRM history */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-extrabold text-slate-800 flex items-center justify-between">
              <span>{t("leadTracker")}</span>
              <span className="text-[10px] bg-teal-600 text-white font-mono px-2 py-0.5 rounded-full">
                REALTIME INGESTED
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">{t("crmLeadDesc")}</p>
          </div>

          {isLoadingLeads ? (
            <div className="text-center py-6 text-slate-400 text-xs animate-pulse">{t("crmLoadingLeads")}</div>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {leads.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => setActiveLeadForLog(lead)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    activeLeadForLog?.id === lead.id
                      ? "bg-slate-50 border-teal-500 shadow-xs"
                      : "border-slate-100 bg-slate-50/20 hover:bg-slate-55"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <strong className="text-sm text-slate-800 line-clamp-1">{lead.companyName}</strong>
                    <span
                      className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase ${
                        lead.status === "new"
                          ? "bg-rose-100 text-rose-800"
                          : lead.status === "contacted"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {lead.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 mt-2 text-[11px] text-slate-500 border-b border-dashed border-slate-150 pb-2">
                    <p>
                      <strong>{t("crmFieldIndustry")}:</strong> {lead.industry || t("crmIndustryUnknown")}
                    </p>
                    <p>
                      <strong>{t("crmFieldCountry")}:</strong> {lead.country || "China"}
                    </p>
                    <p>
                      <strong>{t("crmFieldContact")}:</strong> {lead.contactPerson}
                    </p>
                    <p className="truncate">
                      <strong>{t("crmFieldMethod")}:</strong> {lead.contactMethod}
                    </p>
                  </div>

                  <p className="text-xs text-slate-600 mt-2 bg-white p-2 rounded leading-relaxed border border-slate-100">
                    <strong>{t("crmFieldNotes")}:</strong> {lead.notes}
                  </p>

                  <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2">
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {new Date(lead.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}
                    </span>
                    <span className="text-teal-600 hover:underline">
                      {t("crmFollowUpCount", { num: lead.followUpLogs?.length || 0 })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Lead Detailed Interaction */}
          {activeLeadForLog && (
            <div className="bg-slate-50 rounded-xl p-4 border border-teal-200 mt-4 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest text-teal-700">
                  {t("crmEditingLead", { company: activeLeadForLog.companyName })}
                </h4>
                <button onClick={() => setActiveLeadForLog(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Timeline logs */}
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold pb-2">{t("followUpLogs")}</p>
                {activeLeadForLog.followUpLogs && activeLeadForLog.followUpLogs.length > 0 ? (
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {activeLeadForLog.followUpLogs.map((log, lIdx) => (
                      <div key={lIdx} className="bg-white p-2.5 rounded border border-slate-200 text-xs">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <strong>{log.author}</strong>
                          <span>{log.date}</span>
                        </div>
                        <p className="text-slate-700 mt-1 leading-relaxed">{log.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 italic">暂无联络节点，快在下方录入首个转化里程碑。</div>
                )}
              </div>

              {/* Quick Follow up form */}
              <form onSubmit={handleSubmitLog} className="space-y-2">
                <div>
                  <textarea
                    placeholder={t("crmLogPlaceholder")}
                    value={newCrmLogEntry}
                    onChange={(e) => setNewCrmLogEntry(e.target.value)}
                    rows={2}
                    className="w-full bg-white border border-slate-200 rounded p-2 text-xs text-slate-755 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="flex gap-2 items-center">
                  <select
                    value={crmLogStatus}
                    onChange={(e) => setCrmLogStatus(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                  >
                    <option value="">{t("crmLeadPhase")}</option>
                    <option value="new">🆕 new (未联系)</option>
                    <option value="contacted">📞 contacted (已对接)</option>
                    <option value="qualified">✅ qualified (高意向)</option>
                    <option value="lost">❌ lost (已流失)</option>
                  </select>

                  <button
                    type="submit"
                    className="flex-1 py-1 px-3 bg-slate-900 hover:bg-slate-855 text-white rounded text-xs font-semibold"
                  >
                    {t("crmSaveToCRM")}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
