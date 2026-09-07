"use client";

/**
 * 中标情报 / 买家情报页 — 100% 还原设计图
 * Award Intelligence / Buyer Intelligence Page
 *
 * @module app/(public)/award-intelligence/page-client
 */
import { useState } from "react";
import {
  DollarSign, PieChart, Users, Bell, Search,
  ArrowRight, Star, FileSearch, Building2, UserCheck,
  TrendingUp, Clock, Link2, Eye, FileSpreadsheet, Code,
  FileText, Crown, Shield,
} from "lucide-react";

/* ── Mock Data ── */
const STATS = [
  { label: "中标记录", value: "[实时数]", sub: "" },
  { label: "采购机构档案", value: "[实时数]", sub: "" },
  { label: "可追踪竞争对手", value: "[实时数]", sub: "" },
  { label: "历史数据", value: "10年+", sub: "" },
];

const INFO_CARDS = [
  {
    title: "采购总额",
    value: "US$18.6M",
    sub: "近12个月采购总额",
    badge: "同比 +12%",
    badgeColor: "text-emerald-600 bg-emerald-50",
    link: "查看趋势",
    icon: DollarSign,
    iconColor: "text-blue-500",
    borderColor: "border-l-blue-500",
  },
  {
    title: "高频品类",
    value: "医疗耗材 / PPE\n检验设备",
    sub: "",
    badge: "UNSPSC",
    badgeColor: "text-teal-600 bg-teal-50",
    link: "查看品类",
    icon: PieChart,
    iconColor: "text-teal-500",
    borderColor: "border-l-teal-500",
  },
  {
    title: "主要中标商",
    value: "Top 20 供应商可追踪",
    sub: "",
    badge: "竞争情报",
    badgeColor: "text-amber-600 bg-amber-50",
    link: "查看名单",
    icon: Users,
    iconColor: "text-orange-500",
    borderColor: "border-l-orange-500",
  },
  {
    title: "下一次机会",
    value: "预计 Q4 再次采购",
    sub: "",
    badge: "采购周期",
    badgeColor: "text-emerald-600 bg-emerald-50",
    link: "设置提醒",
    icon: Bell,
    iconColor: "text-emerald-500",
    borderColor: "border-l-emerald-500",
  },
];

const BUYER_PROFILE = [
  { label: "机构名称", value: "XXX 国家卫生部" },
  { label: "国家/地区", value: "肯尼亚" },
  { label: "机构类型", value: "政府部门" },
  { label: "主要资金来源", value: "国家预算 / 世界银行" },
  { label: "常采购品类", value: "医疗耗材 / PPE / 检验设备" },
  { label: "历史采购总额", value: "US$18.6M" },
  { label: "活跃度", value: "★★★★★", isStar: true },
];

const TREND_DATA = [
  { month: "5月", amount: 1.2, count: 15 },
  { month: "6月", amount: 1.8, count: 20 },
  { month: "7月", amount: 1.5, count: 18 },
  { month: "8月", amount: 2.0, count: 22 },
  { month: "9月", amount: 2.2, count: 25 },
  { month: "10月", amount: 1.9, count: 21 },
  { month: "11月", amount: 2.5, count: 28 },
  { month: "12月", amount: 2.8, count: 30 },
  { month: "1月", amount: 2.3, count: 24 },
  { month: "2月", amount: 3.0, count: 32 },
  { month: "3月", amount: 3.5, count: 35 },
  { month: "4月", amount: 2.9, count: 30 },
];

const CYCLE_HINTS = [
  { quarter: "Q1 1-3月", status: "偏低" },
  { quarter: "Q2 4-6月", status: "上升" },
  { quarter: "Q3 7-9月", status: "高峰" },
  { quarter: "Q4 10-12月", status: "预计再次采购" },
];

const TOP5_WINNERS = [
  { rank: 1, name: "ABC Medical Ltd.", amount: "$4.2M", count: 28 },
  { rank: 2, name: "Global Health Co.", amount: "$3.1M", count: 21 },
  { rank: 3, name: "MedSupplies Inc.", amount: "$2.6M", count: 17 },
  { rank: 4, name: "HealthCare Solutions", amount: "$1.9M", count: 12 },
  { rank: 5, name: "PrimeMed Group", amount: "$1.3M", count: 9 },
];

/* ── CSS Bar+Line Chart ── */
function TrendChart() {
  const maxAmount = Math.max(...TREND_DATA.map((d) => d.amount));
  const maxCount = Math.max(...TREND_DATA.map((d) => d.count));

  return (
    <div className="relative h-48 flex items-end gap-1 px-2">
      {/* Y-axis labels (amount) */}
      <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-2xs text-slate-400 w-8">
        <span>4M</span><span>3M</span><span>2M</span><span>1M</span><span>0</span>
      </div>
      {/* Y-axis labels (count) */}
      <div className="absolute right-0 top-0 bottom-6 flex flex-col justify-between text-2xs text-slate-400 w-8 text-right">
        <span>40</span><span>30</span><span>20</span><span>10</span><span>0</span>
      </div>
      {/* Bars + Line */}
      <div className="flex-1 flex items-end gap-1 ml-10 mr-10 h-full pb-6 relative">
        {TREND_DATA.map((d, i) => {
          const barH = (d.amount / maxAmount) * 100;
          const dotY = 100 - (d.count / maxCount) * 100;
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center relative h-full justify-end">
              <div
                className="w-full max-w-6 bg-blue-400/70 rounded-t-sm hover:bg-blue-500 transition-colors"
                style={{ height: `${barH}%` }}
                title={`${d.month}: US$${d.amount}M`}
              />
              <div
                className="absolute w-2.5 h-2.5 rounded-full bg-teal-500 border-2 border-white shadow-sm"
                style={{ bottom: `${dotY}%`, transform: "translateY(50%)" }}
                title={`${d.month}: ${d.count} 项`}
              />
              <span className="text-2xs text-slate-400 mt-1 absolute -bottom-5">{d.month}</span>
            </div>
          );
        })}
        {/* SVG line overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ paddingBottom: "24px" }}>
          <polyline
            fill="none"
            stroke="#14b8a6"
            strokeWidth="2"
            points={TREND_DATA.map((d, i) => {
              const x = ((i + 0.5) / TREND_DATA.length) * 100;
              const y = 100 - (d.count / maxCount) * 100;
              return `${x}%,${y}%`;
            }).join(" ")}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function PageClient() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Page Header ── */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">
          中标结果 / 买家情报{" "}
          <span className="text-teal-400">|</span>{" "}
          <span className="text-lg md:text-xl font-bold text-slate-300">把"历史数据"变成高毛利订阅产品</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-3xl">
          不是简单列出中标结果，而是让用户看到买家周期、竞争格局和价格趋势。
        </p>
      </section>

      <div className="px-4 sm:px-6 lg:px-8 -mt-6">
        {/* ── Stats Bar ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {STATS.map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-lg md:text-xl font-extrabold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ─ Search Bar ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-6 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索：采购方 / 中标企业 / 产品 / 国家 / UNSPSC"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <button className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap">
            查中标情报
          </button>
        </div>

        {/* ── 4 Info Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {INFO_CARDS.map((card) => {
            const Icon = card.icon;
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
                  <button className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                    {card.link} <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Three-column Section ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          {/* Left: Buyer Profile */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-base font-extrabold text-slate-900 mb-1">采购机构画像</h3>
            <p className="text-xs text-slate-500 mb-4">某采购机构（近12个月）</p>
            <div className="space-y-3">
              {BUYER_PROFILE.map((row) => (
                <div key={row.label} className="flex items-start gap-3 text-sm">
                  <span className="shrink-0 w-24 text-xs font-bold text-slate-500">{row.label}</span>
                  {row.isStar ? (
                    <span className="text-amber-400 text-sm">{row.value}</span>
                  ) : (
                    <span className="text-sm font-bold text-slate-800">{row.value}</span>
                  )}
                </div>
              ))}
            </div>
            <button className="mt-5 text-sm font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
              查看机构详情 <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Center: Trend Chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm lg:col-span-1">
            <h3 className="text-base font-extrabold text-slate-900 mb-1">
              采购金额趋势 <span className="text-xs font-normal text-slate-400">（近12个月）</span>
            </h3>
            <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-blue-400/70 inline-block" /> 采购金额（USD）
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500 inline-block" /> 中标项目数
              </span>
            </div>
            <TrendChart />
            {/* Cycle Hints */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="text-xs font-bold text-slate-700 mb-2">采购周期线索</p>
              <div className="grid grid-cols-4 gap-2">
                {CYCLE_HINTS.map((q) => (
                  <div key={q.quarter} className="text-center">
                    <p className="text-2xs font-bold text-slate-600">{q.quarter}</p>
                    <p className={`text-2xs font-bold ${q.status === "预计再次采购" ? "text-teal-600" : "text-slate-400"}`}>
                      {q.status}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <button className="mt-3 text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 mx-auto">
              查看趋势详情 <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Right: TOP5 Winners */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-base font-extrabold text-slate-900 mb-1">
              主要中标商 TOP 5 <span className="text-xs font-normal text-slate-400">（近12个月）</span>
            </h3>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 text-slate-400 font-bold">排名</th>
                    <th className="text-left py-2 text-slate-400 font-bold">中标商</th>
                    <th className="text-right py-2 text-slate-400 font-bold">中标金额(USD)</th>
                    <th className="text-right py-2 text-slate-400 font-bold">中标项目数</th>
                  </tr>
                </thead>
                <tbody>
                  {TOP5_WINNERS.map((w) => (
                    <tr key={w.rank} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 font-bold text-slate-400">{w.rank}</td>
                      <td className="py-2.5 font-bold text-slate-800">{w.name}</td>
                      <td className="py-2.5 text-right font-bold text-slate-700">{w.amount}</td>
                      <td className="py-2.5 text-right text-slate-600">{w.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="mt-4 text-sm font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
              查看完整名单 <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ══ 核心内容模块 ═══ */}
      <section className="px-4 sm:px-6 lg:px-8 py-10 bg-white border-t border-slate-100">
        <div className="text-center mb-8">
          <h2 className="text-xl font-extrabold text-slate-900">核心内容模块</h2>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="w-8 h-px bg-teal-500" />
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            <span className="w-8 h-px bg-teal-500" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5 max-w-6xl mx-auto">
          {[
            { icon: FileSearch, title: "中标结果搜索", desc: "多维度搜索中标记录，支持高级筛选与快速定位关键项目" },
            { icon: Building2, title: "采购机构画像", desc: "展示机构背景、采购偏好、历史金额与活跃度，深度理解买家行为" },
            { icon: UserCheck, title: "中标商画像", desc: "追踪供应商中标表现、份额变化与合作历史，洞察竞争格局" },
            { icon: TrendingUp, title: "价格/金额趋势", desc: "金额随时间变化趋势，品类价格区间与波动，支持同比分析" },
            { icon: Clock, title: "预计再次采购提醒", desc: "基于历史周期预测下次采购时间，提前把握销售机会" },
            { icon: Link2, title: "与新标/供应商互链", desc: "中标结果与在招标关联，关联供应商库与产品，形成完整情报链" },
          ].map((mod) => {
            const Icon = mod.icon;
            return (
              <div key={mod.title} className="bg-slate-50 hover:bg-white rounded-2xl border border-slate-200 hover:border-teal-200 p-5 text-center transition-all hover:shadow-md group">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white border border-slate-100 mb-3 group-hover:scale-110 transition-transform">
                  <Icon className="w-6 h-6 text-teal-600" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 mb-1">{mod.title}</h3>
                <p className="text-2xs text-slate-500 leading-relaxed">{mod.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═ 变现动作 ═══ */}
      <section className="px-4 sm:px-6 lg:px-8 py-10">
        <div className="text-center mb-8">
          <h2 className="text-xl font-extrabold text-slate-900">变现动作</h2>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="w-8 h-px bg-teal-500" />
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            <span className="w-8 h-px bg-teal-500" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 max-w-6xl mx-auto">
          {[
            { icon: Eye, title: "专业会员", desc: "解锁全部情报与数据深度分析" },
            { icon: FileText, title: "竞争情报包", desc: "行业/国家/机构专属情报包" },
            { icon: UserCheck, title: "买家追踪", desc: "订阅特定机构采购周期提醒" },
            { icon: TrendingUp, title: "竞争对手监控", desc: "供应商中标动态监控与预警" },
            { icon: FileSpreadsheet, title: "Excel导出", desc: "批量导出中标结果与趋势报表" },
            { icon: Code, title: "API", desc: "数据接口接入企业系统" },
            { icon: FileText, title: "定制市场报告", desc: "按需定制机构或市场维度报告" },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <div key={action.title} className="text-center group">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 mb-2 group-hover:bg-teal-50 transition-colors">
                  <Icon className="w-5 h-5 text-slate-600 group-hover:text-teal-600 transition-colors" />
                </div>
                <p className="text-xs font-bold text-slate-900">{action.title}</p>
                <p className="text-2xs text-slate-400 mt-0.5 leading-tight">{action.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ 页面价值 ═══ */}
      <section className="px-4 sm:px-6 lg:px-8 py-10 bg-slate-50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            { icon: Eye, title: "从\"看标\"升级为\"看市场\"", desc: "不只看到单个项目，更看懂市场机会与趋势" },
            { icon: Crown, title: "买家情报是企业版续费理由", desc: "深度数据 + 趋势洞察，提升续费率与粘性" },
            { icon: Shield, title: "高毛利数据价值来自历史与关联分析", desc: "独家历史数据与算法模型，构建高商护城河" },
          ].map((v) => {
            const Icon = v.icon;
            return (
              <div key={v.title} className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/10 mb-4">
                  <Icon className="w-6 h-6 text-teal-400" />
                </div>
                <h3 className="text-sm font-extrabold text-white mb-2">{v.title}</h3>
                <p className="text-2xs text-slate-400 leading-relaxed">{v.desc}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
