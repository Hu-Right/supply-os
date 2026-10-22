"use client";

/**
 * 中标情报 / 买家情报页 — 容器（数据驱动 + 诚实空态）
 * Award Intelligence / Buyer Intelligence Page
 *
 * @module app/(public)/award-intelligence/page-client
 * @description 页面容器：以视图模型（buildAwardViewModel）为唯一取数口径，把真实中标数据
 *              派生为各板块切片下发；无真数据即诚实空态，不再展示 curatedData 假数。
 *              数据来自 useAwardsData（/api/awards*）；趋势图/卡片/弹窗分别见 ./TrendChart、
 *              ./sections/cards、./Modals。
 */
import { useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";
import type { CnAwardCase } from "@/data/cn-award-cases";
import { useAwardsData } from "@/features/procurement/hooks/useAwardsData";
import { buildAwardViewModel, type WinnerRow } from "@/features/procurement/awards/awardViewModel";
import { TrendChart } from "./TrendChart";
import {
  AgencyModal, CategoryModal, WinnersModal, SupplierModal, CalendarModal,
  ReminderModal, CnCaseDetailModal,
} from "./Modals";
import { CnCaseSection } from "./sections/CnCaseSection";
import { InfoCardsGrid, BuyerProfileCard, TopWinnersCard, RecentAwardsCard } from "./sections/cards";

export default function PageClient() {
  const router = useRouter();
  const trendRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [winnersOpen, setWinnersOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [agencyOpen, setAgencyOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<WinnerRow | null>(null);
  const [cnDetail, setCnDetail] = useState<CnAwardCase | null>(null);

  // ── 真实中标数据 → 视图模型（唯一取数口径）；useMemo 稳定引用，避免交互时图表重建 ──
  const awardsData = useAwardsData();
  const vm = useMemo(() => buildAwardViewModel(awardsData), [awardsData]);

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
        <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">{vm.copy.heroTitle}</h1>
        <p className="text-slate-300 text-sm max-w-3xl">{vm.copy.heroSubtitle}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-2xs text-teal-200">
          <span className="px-2 py-0.5 rounded bg-white/10">来源：{vm.coverage.sources.join("、") || "接入中"}</span>
          <span className="px-2 py-0.5 rounded bg-white/10">{vm.coverage.recordCount.toLocaleString()} 条记录</span>
          <span className="px-2 py-0.5 rounded bg-white/10">覆盖 {vm.coverage.countries.length} 国</span>
          {vm.coverage.amountAvailable
            ? <span className="px-2 py-0.5 rounded bg-white/10">金额已接入</span>
            : <span className="px-2 py-0.5 rounded bg-white/10">金额未公开（接入中）</span>}
        </div>
      </section>

      <div className="px-4 sm:px-6 lg:px-8 -mt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {vm.statsCards.length > 0 ? vm.statsCards.map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-lg md:text-xl font-extrabold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
              {s.sub && <p className="text-2xs text-emerald-600 mt-0.5">{s.sub}</p>}
            </div>
          )) : <div className="col-span-full text-center text-xs text-slate-400 py-4">真实中标数据接入中</div>}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-6 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索：采购方 / 中标企业 / 项目"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
          </div>
          <button onClick={handleSearch} className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap">查中标情报</button>
        </div>

        <InfoCardsGrid cards={vm.infoCards} onAction={handleCardAction} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <BuyerProfileCard section={vm.buyerProfile} onOpenAgency={() => setAgencyOpen(true)} />

          <div ref={trendRef} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm lg:col-span-1 scroll-mt-20">
            <h3 className="text-base font-extrabold text-slate-900 mb-3">采购趋势 <span className="text-xs font-normal text-slate-400">（近 {vm.trend.present ? vm.trend.data.months.length : 0} 个月）</span></h3>
            {vm.trend.present ? <TrendChart series={vm.trend.data} /> : <p className="text-xs text-slate-400 py-8 text-center">{vm.trend.reason}</p>}
            <button onClick={() => setCalendarOpen(true)} className="mt-3 text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 mx-auto">查看趋势详情</button>
          </div>

          <TopWinnersCard section={vm.topWinners} onSelectSupplier={(w) => setSelectedSupplier(w)} onOpenWinners={() => setWinnersOpen(true)} />
        </div>

        <div className="mb-8">
          <RecentAwardsCard rows={vm.recentAwards} />
        </div>
      </div>

      <CnCaseSection note={vm.copy.cnCasesNote} onOpenDetail={(c) => setCnDetail(c)} />

      {/* 弹窗 */}
      <CategoryModal open={categoryOpen} onClose={() => setCategoryOpen(false)} section={vm.categories} />
      <WinnersModal open={winnersOpen} onClose={() => setWinnersOpen(false)} section={vm.topWinners} onViewSupplier={(s) => { setSelectedSupplier(s); setWinnersOpen(false); }} />
      <ReminderModal open={reminderOpen} onClose={() => setReminderOpen(false)} />
      <AgencyModal open={agencyOpen} onClose={() => setAgencyOpen(false)} />
      <CalendarModal open={calendarOpen} onClose={() => setCalendarOpen(false)} trend={vm.trend} />
      <SupplierModal open={!!selectedSupplier} onClose={() => setSelectedSupplier(null)} supplier={selectedSupplier} />
      <CnCaseDetailModal open={!!cnDetail} onClose={() => setCnDetail(null)} caseItem={cnDetail} />
    </div>
    </ErrorBoundary>
  );
}
