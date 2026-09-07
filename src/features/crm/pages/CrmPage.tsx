/**
 * AI投标工作台/CRM 页面 — 100% 还原设计图
 * AI Bidding Workspace / CRM Page
 *
 * @module features/crm/pages/CrmPage
 * @description 左侧导航 + 顶部4统计卡 + 商机漏斗/AI Bid-NoBid双栏 + 底部4功能卡。
 *              登录态工作台，展示企业投标全流程管理。
 */
import { useLocale } from "@/core/i18n";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Briefcase, Sparkles, CalendarDays,
  Users, FolderOpen, Headphones, Settings,
  TrendingUp, Clock, CheckSquare, FileText,
  ChevronDown, Info,
} from "lucide-react";
import type { Supplier } from "@/types";
import { useCrmData } from "../hooks/useCrmData";
import { DigitalAssistant } from "../components/DigitalAssistant/DigitalAssistant";

/* ── 左侧导航项 ── */
const NAV_ITEMS = [
  { key: "overview", label: "工作概览", icon: LayoutDashboard },
  { key: "opportunities", label: "我的商机", icon: Briefcase },
  { key: "ai-eval", label: "AI评估", icon: Sparkles },
  { key: "calendar", label: "截止日历", icon: CalendarDays },
  { key: "tasks", label: "团队任务", icon: Users },
  { key: "files", label: "文件中心", icon: FolderOpen },
  { key: "consultant", label: "顾问协同", icon: Headphones },
  { key: "settings", label: "企业设置", icon: Settings },
];

/* ── 商机漏斗数据 ── */
const FUNNEL_DATA = [
  { label: "新匹配", value: 23, color: "bg-teal-500" },
  { label: "已收藏", value: 12, color: "bg-teal-400" },
  { label: "评估中", value: 7, color: "bg-teal-300" },
  { label: "准备投标", value: 3, color: "bg-teal-200" },
  { label: "已提交", value: 1, color: "bg-teal-100" },
];

/* ── 底部功能卡 ── */
const FEATURE_CARDS = [
  { icon: CalendarDays, title: "截止日历", lines: ["7天内 7 个截止", "本月 23 个截止"] },
  { icon: CheckSquare, title: "团队任务", lines: ["待办 5 个任务", "已完成 12 个"] },
  { icon: FileText, title: "文件中心", lines: ["投标文件 128 份", "共享文件 32 份"] },
  { icon: Headphones, title: "顾问协同", lines: ["在线顾问 3 位", "咨询记录 18 条"] },
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
    matchSelectedSupplier,
    matchSelectedOpportunity,
    isAiMatching,
    aiReport,
    setMatchSelectedSupplier,
    setMatchSelectedOpportunity,
    triggerAiMatchmaking,
  } = useCrmData({ autoMatchSupplier });

  const maxFunnel = Math.max(...FUNNEL_DATA.map((f) => f.value));

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* ═══ 左侧导航栏 ═══ */}
      <aside className="w-56 shrink-0 bg-slate-900 text-white flex flex-col">
        <div className="p-4">
          <h2 className="text-lg font-extrabold">AI投标工作台</h2>
        </div>
        <nav className="flex-1 px-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveNav(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-teal-600 text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        {/* AI额度 + 团队 + 升级 */}
        <div className="p-4 space-y-4 border-t border-white/10">
          <div>
            <p className="text-xs text-slate-400 mb-1">本月AI额度</p>
            <p className="text-sm font-bold text-white">已用 58 / 100 次</p>
            <div className="mt-1.5 h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full w-[58%] rounded-full bg-teal-500" />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400">团队成员 <span className="text-white font-bold">6/20</span></p>
          </div>
          <button className="w-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold py-2.5 rounded-lg transition-colors">
            升级企业版<br />解锁更多能力
          </button>
        </div>
      </aside>

      {/* ═══ 主内容区 ═══ */}
      <main className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* 顶部4统计卡 */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { value: "23", label: "我的匹配商机", sub: "较昨日 +5", icon: Briefcase, color: "text-teal-600", bg: "bg-teal-50" },
            { value: "7", label: "7天内截止", sub: "较昨日 -2", icon: Clock, color: "text-rose-600", bg: "bg-rose-50" },
            { value: "5", label: "待处理任务", sub: "较昨日 +1", icon: CheckSquare, color: "text-amber-600", bg: "bg-amber-50" },
            { value: "82%", label: "企业资料完整度", sub: "较上周 +8%", icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-3xl font-extrabold text-slate-900">{card.value}</p>
                    <p className="text-sm font-bold text-slate-700 mt-1">{card.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{card.sub}</p>
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
          {/* 左：我的商机漏斗 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-extrabold text-slate-900">我的商机漏斗</h3>
              <button className="text-xs text-slate-500 flex items-center gap-1">
                全部国家 <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-4">
              {FUNNEL_DATA.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="w-16 text-sm font-bold text-slate-700 shrink-0">{item.label}</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full transition-all`}
                      style={{ width: `${(item.value / maxFunnel) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm font-extrabold text-slate-900">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 右：AI Bid / No-Bid */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">AI Bid / No-Bid</h3>
              <button className="text-xs text-slate-400 flex items-center gap-1">
                <Info className="w-3 h-3" /> 使用指南
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              选择企业 + 选择采购机会 → 自动输出资质命中、缺口、风险、建议动作
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">选择企业</label>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 outline-none">
                  <option>请选择企业</option>
                  {totalSuppliersList.map((s) => (
                    <option key={s.id} value={s.id}>{s.nameZh || s.nameEn || s.id}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">选择采购机会</label>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 outline-none">
                    <option>请选择采购机会</option>
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
                  {isAiMatching ? "评估中..." : "立即评估"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-xs text-slate-500">将输出：</span>
                {["资质命中率", "缺口清单", "风险提示", "建议动作", "胜率预估"].map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-2xs font-bold text-teal-700">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            {/* AI报告展示 */}
            {aiReport && (
              <div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-xs font-bold text-slate-700 mb-2">AI 评估报告</p>
                <pre className="text-xs text-slate-600 whitespace-pre-wrap">{JSON.stringify(aiReport, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>

        {/* 底部4功能卡 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900 mb-1">截止日历 / 团队任务 / 文件中心 / 顾问协同</h3>
          <p className="text-xs text-slate-500 mb-4">CRM属于登录后的工作台，不再作为官网一级导航展示内部"0条线索"。</p>
          <div className="grid grid-cols-4 gap-4">
            {FEATURE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="text-center p-4 rounded-xl border border-slate-100 hover:border-teal-200 transition-colors">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-50 mb-3">
                    <Icon className="w-6 h-6 text-teal-600" />
                  </div>
                  <p className="text-sm font-extrabold text-slate-900 mb-1">{card.title}</p>
                  {card.lines.map((line) => (
                    <p key={line} className="text-xs text-slate-500">{line}</p>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Digital Assistant — 保留原有AI对话功能 */}
        <DigitalAssistant />
      </main>
    </div>
  );
}

CrmPage.displayName = "CrmPage";
