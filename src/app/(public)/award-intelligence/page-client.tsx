"use client";

/**
 * 中标情报 / 买家情报页 — 容器
 * Award Intelligence / Buyer Intelligence Page
 *
 * @module app/(public)/award-intelligence/page-client
 * @description 页面容器：组合策展数据、趋势图与弹窗，管理全局 UI 状态。
 *              数据/图表/弹窗分别拆至 ./curatedData、./TrendChart、./Modals
 *              （原 990 行 god 组件按关注点拆分）。真实数据到位时 useAwardsData
 *              返回数据优先展示，策展数据作降级兜底。
 *              2026-10 组件化拆分（291→约 160 行）：中国案例板块（含其私有浏览态）见
 *              ./sections/CnCaseSection，速览卡/画像卡/TOP5 卡见 ./sections/cards。
 */
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";
import type { CnAwardCase } from "@/data/cn-award-cases";
import { useAwardsData } from "@/features/procurement/hooks/useAwardsData";
import { CURATED_STATS, CYCLE_HINTS, type SelectedSupplier } from "./curatedData";
import { TrendChart } from "./TrendChart";
import {
  AgencyModal, CategoryModal, WinnersModal, SupplierModal, CalendarModal,
  ReminderModal, CnCaseDetailModal,
} from "./Modals";
import { CnCaseSection } from "./sections/CnCaseSection";
import { InfoCardsGrid, BuyerProfileCard, TopWinnersCard } from "./sections/cards";

export default function PageClient() {
  const router = useRouter();
  const trendRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [winnersOpen, setWinnersOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [agencyOpen, setAgencyOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SelectedSupplier | null>(null);
  // 中国企业中标案例详情（浏览态内聚在 CnCaseSection，弹窗目标归容器）
  const [cnDetail, setCnDetail] = useState<CnAwardCase | null>(null);

  // ── 真实中标数据（爬虫入库后自动生效） ──
  const awardsData = useAwardsData();

  // 动态 STATS：有真实数据时用真实数据，否则降级到策展数据
  const STATS = awardsData.hasRealData && awardsData.stats
    ? [
        { label: "中标记录", value: awardsData.stats.total.toLocaleString(), sub: `本月 +${awardsData.stats.by_month[0]?.count ?? 0}` },
        { label: "采购机构档案", value: String(awardsData.stats.by_agency.length), sub: `覆盖 ${awardsData.stats.by_country.length} 个国家` },
        { label: "可追踪竞争对手", value: `${awardsData.stats.top_winners.length}+`, sub: "持续更新中" },
        { label: "数据追踪", value: awardsData.stats.by_month.length > 0 ? `${awardsData.stats.by_month[awardsData.stats.by_month.length - 1].month.slice(0, 4)}年起` : "2016年起", sub: "持续更新中" },
      ]
    : CURATED_STATS;

  const handleSearch = () => {
    const q = searchQuery.trim();
    router.push(`/procurement${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  };

  // 速览卡动作分派（稳定引用，保证 InfoCardsGrid memo 有效）
  const handleCardAction = useCallback((link: string) => {
    if (link === "查看趋势") trendRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    else if (link === "查看品类") setCategoryOpen(true);
    else if (link === "查看名单") setWinnersOpen(true);
    else if (link === "设置提醒") setReminderOpen(true);
  }, []);

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
    <div className="min-h-screen bg-slate-50">
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">
          中标结果 / 买家情报{" "}
          <span className="text-teal-400">|</span>{" "}
          <span className="text-lg md:text-xl font-bold text-slate-300">全球中标数据 · 买家情报 · 竞争分析</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-3xl">聚合全球公共采购中标数据，深度分析买家采购周期、竞争格局与价格趋势，助力企业精准把握市场机会。</p>
        {awardsData.hasRealData && (
          <p className="text-teal-400 text-xs mt-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse inline-block" />
            实时数据已接入 · {awardsData.stats?.total.toLocaleString()} 条中标记录
          </p>
        )}
      </section>

      <div className="px-4 sm:px-6 lg:px-8 -mt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {STATS.map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-lg md:text-xl font-extrabold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
              {s.sub && <p className="text-2xs text-emerald-600 mt-0.5">{s.sub}</p>}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-6 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索：采购方 / 中标企业 / 产品 / 国家 / 品类"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
          </div>
          <button onClick={handleSearch} className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap">查中标情报</button>
        </div>

        <InfoCardsGrid onAction={handleCardAction} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <BuyerProfileCard onOpenAgency={() => setAgencyOpen(true)} />

          <div ref={trendRef} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm lg:col-span-1 scroll-mt-20">
            <h3 className="text-base font-extrabold text-slate-900 mb-1">采购金额趋势 <span className="text-xs font-normal text-slate-400">（近12个月）</span></h3>
            <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400/70 inline-block" /> 采购金额（USD）</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-teal-500 inline-block" /> 中标项目数</span>
            </div>
            <TrendChart />
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="text-xs font-bold text-slate-700 mb-2">采购周期线索</p>
              <div className="grid grid-cols-4 gap-2">
                {CYCLE_HINTS.map((q) => (
                  <div key={q.quarter} className="text-center">
                    <p className="text-2xs font-bold text-slate-600">{q.quarter}</p>
                    <p className={`text-2xs font-bold ${q.status === "预计再次采购" ? "text-teal-600" : "text-slate-400"}`}>{q.status}</p>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => setCalendarOpen(true)} className="mt-3 text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 mx-auto">查看趋势详情 <ArrowRight className="w-3 h-3" /></button>
          </div>

          <TopWinnersCard
            onSelectSupplier={(w) => setSelectedSupplier(w)}
            onOpenWinners={() => setWinnersOpen(true)}
          />
        </div>
      </div>

      <CnCaseSection onOpenDetail={(c) => setCnDetail(c)} />

      {/* 弹窗 */}
      <CategoryModal open={categoryOpen} onClose={() => setCategoryOpen(false)} />
      <WinnersModal open={winnersOpen} onClose={() => setWinnersOpen(false)} onViewSupplier={(s) => { setSelectedSupplier(s); setWinnersOpen(false); }} />
      <ReminderModal open={reminderOpen} onClose={() => setReminderOpen(false)} />
      <AgencyModal open={agencyOpen} onClose={() => setAgencyOpen(false)} />
      <CalendarModal open={calendarOpen} onClose={() => setCalendarOpen(false)} />
      <SupplierModal open={!!selectedSupplier} onClose={() => setSelectedSupplier(null)} supplier={selectedSupplier} />
      <CnCaseDetailModal open={!!cnDetail} onClose={() => setCnDetail(null)} caseItem={cnDetail} />
    </div>
    </ErrorBoundary>
  );
}
