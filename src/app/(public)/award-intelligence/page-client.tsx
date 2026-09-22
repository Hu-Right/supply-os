"use client";

/**
 * 中标情报 / 买家情报页
 * Award Intelligence / Buyer Intelligence Page
 *
 * @module app/(public)/award-intelligence/page-client
 * @description 页面容器：组合策展数据、趋势图与弹窗，管理全局 UI 状态。
 *              数据/图表/弹窗分别拆至 ./curatedData、./TrendChart、./Modals
 *              （原 990 行 god 组件按关注点拆分）。真实数据到位时 useAwardsData
 *              返回数据优先展示，策展数据作降级兜底。
 */
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";
import { CN_AWARD_CASES, CN_CASE_CATEGORIES, type CnAwardCase } from "@/data/cn-award-cases";
import { useAwardsData } from "@/features/procurement/hooks/useAwardsData";
import {
  CURATED_STATS, INFO_CARDS, BUYER_PROFILE, CYCLE_HINTS, TOP5_WINNERS,
  type SelectedSupplier,
} from "./curatedData";
import { TrendChart } from "./TrendChart";
import {
  AgencyModal, CategoryModal, WinnersModal, SupplierModal, CalendarModal,
  ReminderModal, CnCaseDetailModal,
} from "./Modals";

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
  // 中国企业中标案例
  const [cnCategory, setCnCategory] = useState("全部");
  const [cnSearch, setCnSearch] = useState("");
  const [cnShowAll, setCnShowAll] = useState(false);
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
  const scrollToTrend = () => trendRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

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
              placeholder="搜索：采购方 / 中标企业 / 产品 / 国家 / UNSPSC"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
          </div>
          <button onClick={handleSearch} className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap">查中标情报</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {INFO_CARDS.map((card) => {
            const Icon = card.icon;
            const handleCardAction = () => {
              if (card.link === "查看趋势") scrollToTrend();
              else if (card.link === "查看品类") setCategoryOpen(true);
              else if (card.link === "查看名单") setWinnersOpen(true);
              else if (card.link === "设置提醒") setReminderOpen(true);
            };
            return (
              <div key={card.title} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${card.borderColor} p-5 shadow-sm`}>
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-900">{card.title}</h3>
                  <Icon className={`w-8 h-8 ${card.iconColor} opacity-80`} />
                </div>
                <p className="text-xl font-extrabold text-slate-900 whitespace-pre-line mb-1">{card.value}</p>
                {card.sub && <p className="text-xs text-slate-500 mb-3">{card.sub}</p>}
                <div className="flex items-center justify-between mt-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${card.badgeColor}`}>{card.badge}</span>
                  <button onClick={handleCardAction} className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">{card.link} <ArrowRight className="w-3 h-3" /></button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-base font-extrabold text-slate-900 mb-1">采购机构画像</h3>
            <p className="text-xs text-slate-500 mb-4">UNICEF 采购画像（近12个月）</p>
            <div className="space-y-3">
              {BUYER_PROFILE.map((row) => (
                <div key={row.label} className="flex items-start gap-3 text-sm">
                  <span className="shrink-0 w-24 text-xs font-bold text-slate-500">{row.label}</span>
                  {row.isStar ? <span className="text-amber-400 text-sm">{row.value}</span> : <span className="text-sm font-bold text-slate-800">{row.value}</span>}
                </div>
              ))}
            </div>
            <button onClick={() => setAgencyOpen(true)} className="mt-5 text-sm font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">查看机构详情 <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>

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

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-base font-extrabold text-slate-900 mb-1">主要中标商 TOP 5 <span className="text-xs font-normal text-slate-400">（UN医疗品类）</span></h3>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 text-slate-400 font-bold">排名</th>
                    <th className="text-left py-2 text-slate-400 font-bold">供应商</th>
                    <th className="text-left py-2 text-slate-400 font-bold">品类</th>
                    <th className="text-center py-2 text-slate-400 font-bold">UNGM</th>
                  </tr>
                </thead>
                <tbody>
                  {TOP5_WINNERS.map((w) => (
                    <tr key={w.rank} className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer" onClick={() => setSelectedSupplier(w)}>
                      <td className="py-2.5 font-bold text-slate-400">{w.rank}</td>
                      <td className="py-2.5 font-bold text-teal-700 hover:underline">{w.name}</td>
                      <td className="py-2.5 text-slate-600">{w.category}</td>
                      <td className="py-2.5 text-center">
                        <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${w.level === "UNGM L2" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                          {w.level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setWinnersOpen(true)} className="mt-4 text-sm font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">查看完整名单 <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      {/* ── 中国企业联合国采购中标案例板块 ── */}
      <section className="px-4 sm:px-6 lg:px-8 mb-10">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">中国企业联合国采购中标案例</h3>
              <p className="text-xs text-slate-500 mt-0.5">30 个官方可核验案例 · 涵盖 UNICEF / WHO / UNDP / UNOPS / UNHCR</p>
            </div>
            <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-lg">{CN_AWARD_CASES.length} 例</span>
          </div>

          {/* 类别筛选 */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {["全部", ...CN_CASE_CATEGORIES].map((cat) => (
              <button key={cat} onClick={() => { setCnCategory(cat); setCnShowAll(false); }}
                className={`text-2xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                  cnCategory === cat ? "bg-teal-600 text-white border-teal-600" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}>
                {cat}
              </button>
            ))}
          </div>

          {/* 搜索 */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="text" value={cnSearch} onChange={(e) => { setCnSearch(e.target.value); setCnShowAll(false); }}
              placeholder="搜索：企业名 / 采购内容 / 合同编号 / UN机构"
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
          </div>

          {/* 案例卡片 */}
          {(() => {
            const filtered = CN_AWARD_CASES.filter((c) => {
              const matchCat = cnCategory === "全部" || c.category === cnCategory;
              const q = cnSearch.trim().toLowerCase();
              const matchSearch = !q || c.winnerCN.toLowerCase().includes(q) || c.winnerEN.toLowerCase().includes(q) ||
                c.content.toLowerCase().includes(q) || c.contractNo.toLowerCase().includes(q) || c.agency.toLowerCase().includes(q);
              return matchCat && matchSearch;
            });
            const displayed = cnShowAll ? filtered : filtered.slice(0, 6);
            if (filtered.length === 0) {
              return <p className="text-center text-xs text-slate-400 py-8">无匹配案例</p>;
            }
            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {displayed.map((c) => {
                    const fmtAmt = c.amountUSD ? `USD ${c.amountUSD.toLocaleString()}` : c.amountText;
                    return (
                      <div key={c.id} onClick={() => setCnDetail(c)}
                        className="border border-slate-200 rounded-lg p-3.5 hover:border-teal-300 hover:shadow-sm cursor-pointer transition-all group">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-2xs font-bold text-slate-400">#{c.id}</span>
                          <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${
                            c.evidenceLevel.includes("A+") ? "bg-emerald-100 text-emerald-700" :
                            c.evidenceLevel === "A" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                          }`}>{c.evidenceLevel}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 mb-1 line-clamp-2 group-hover:text-teal-700 transition-colors">{c.content}</p>
                        <p className="text-2xs font-bold text-teal-700 mb-1.5 truncate">{c.winnerCN}</p>
                        <div className="flex items-center justify-between text-2xs text-slate-400">
                          <span>{c.agency}</span>
                          <span className="font-bold text-slate-600">{fmtAmt}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {filtered.length > 6 && !cnShowAll && (
                  <button onClick={() => setCnShowAll(true)}
                    className="mt-4 mx-auto block text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                    查看全部 {filtered.length} 个案例 <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </>
            );
          })()}
        </div>
      </section>

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
