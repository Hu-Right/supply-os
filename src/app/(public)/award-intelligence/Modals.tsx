"use client";

/**
 * 中标情报页 — 弹窗组件集合
 * Award Intelligence — Modals
 *
 * @module app/(public)/award-intelligence/Modals
 * @description 从 990 行 page-client 拆出的全部对话框组件与通用展示件
 *              （DataSource / MetricCard / Info）。数据取自 ./curatedData。
 */
import { useState } from "react";
import {
  TrendingUp, CheckCircle2, AlertCircle, Award, Globe, Calendar, Bell,
} from "lucide-react";
import { Modal } from "@/shared/ui";
import type { CnAwardCase } from "@/data/cn-award-cases";
import { getLast12Months, TREND_DATA, type SelectedSupplier } from "./curatedData";

/** 通用弹窗底部数据来源（分层标注） */
function DataSource({ authoritative, analysis }: { authoritative: string; analysis?: string }) {
  return (
    <div className="mt-4 pt-3 border-t border-slate-100 text-center space-y-0.5">
      <p className="text-2xs text-slate-400">权威数据：{authoritative}</p>
      {analysis && <p className="text-2xs text-slate-300">分析数据：{analysis}</p>}
    </div>
  );
}

/** 通用指标卡片 */
function MetricCard({ label, value, color = "text-slate-900" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <p className={`text-lg font-extrabold ${color}`}>{value}</p>
      <p className="text-2xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

/* ── 1. 机构画像详情弹窗 ── */
export function AgencyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const yearlyTrend = [
    { year: "2021", amount: "$4.2B" },
    { year: "2022", amount: "$4.8B" },
    { year: "2023", amount: "$5.1B" },
    { year: "2024", amount: "$5.4B" },
    { year: "2025", amount: "$5.677B" },
  ];
  const categories = [
    { name: "疫苗", pct: 43, amount: "$2.45B" },
    { name: "医疗耗材", pct: 22, amount: "$1.25B" },
    { name: "营养品", pct: 15, amount: "$850M" },
    { name: "教育物资", pct: 10, amount: "$570M" },
    { name: "WASH 水卫生", pct: 6, amount: "$340M" },
    { name: "其他", pct: 4, amount: "$227M" },
  ];
  return (
    <Modal open={open} onClose={onClose} title="" className="max-w-2xl">
      {/* 机构头部 */}
      <div className="flex items-start gap-4 mb-5">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-xs font-extrabold shrink-0">
          UNICEF
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-extrabold text-slate-900">联合国儿童基金会</h3>
          <p className="text-xs text-slate-500">United Nations Children's Fund · 成立于 1946 年</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {["联合国专门机构", "纽约总部", "193 个成员国"].map((t) => (
              <span key={t} className="text-2xs font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-700">{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* 关键指标 */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        <MetricCard label="2025年采购额" value="$5.677B" color="text-teal-600" />
        <MetricCard label="占UN全球采购" value="20%+" color="text-blue-600" />
        <MetricCard label="供应商数量" value="12,000+" color="text-amber-600" />
        <MetricCard label="覆盖国家" value="178" color="text-purple-600" />
      </div>

      {/* 历年采购趋势 */}
      <div className="mb-5">
        <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-teal-500" /> 历年采购趋势</p>
        <div className="flex items-end gap-2 h-20">
          {yearlyTrend.map((y) => {
            const maxAmt = 5.677;
            const val = parseFloat(y.amount.replace(/[$BM]/g, ""));
            const h = (val / maxAmt) * 100;
            return (
              <div key={y.year} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="text-2xs font-bold text-slate-700 mb-1">{y.amount}</span>
                <div className="w-full bg-teal-500 rounded-t-sm" style={{ height: `${h}%` }} />
                <span className="text-2xs text-slate-400 mt-1">{y.year}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 品类分布 + 供应商准入 */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs font-bold text-slate-700 mb-2">主要采购品类</p>
          <div className="space-y-1.5">
            {categories.map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <span className="w-20 text-2xs text-slate-600 truncate">{c.name}</span>
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full" style={{ width: `${c.pct}%` }} />
                </div>
                <span className="text-2xs font-bold text-slate-700 w-12 text-right">{c.amount}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-700 mb-2">供应商准入要求</p>
          <div className="space-y-1.5 text-2xs text-slate-600">
            {["UNGM 注册（L1 基础级 / L2 高级）", "ISO 9001 质量管理体系认证", "符合 UN 供应商行为准则", "财务审计报告（近 3 年）", "无制裁/黑名单记录"].map((r) => (
              <div key={r} className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-teal-500 mt-0.5 shrink-0" />
                <span>{r}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 p-2 rounded-lg bg-amber-50 border border-amber-100">
            <p className="text-2xs font-bold text-amber-700 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> 典型采购周期</p>
            <p className="text-2xs text-amber-600 mt-0.5">从招标到授标平均 45-90 天；紧急采购可缩短至 14 天</p>
          </div>
        </div>
      </div>

      <DataSource authoritative="UNICEF Supply Annual Report / UNGM" analysis="历年趋势与品类占比为平台分析模型" />
    </Modal>
  );
}

/* ── 2. 品类分布弹窗 ─ */
export function CategoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mainCats = [
    { name: "药品与疫苗", pct: 38, amount: "US$8.6B", growth: "+5.2%", sub: ["mRNA 疫苗", "口服补液盐", "抗疟药", "抗生素", "胰岛素"] },
    { name: "医疗设备", pct: 22, amount: "US$5.0B", growth: "+8.1%", sub: ["呼吸机", "超声诊断仪", "X 光机", "输液泵", "监护仪"] },
    { name: "建筑与工程", pct: 16, amount: "US$3.6B", growth: "+12.3%", sub: ["学校建设", "医疗设施", "供水系统", "道路基建", "临时庇护所"] },
    { name: "ICT 信息技术", pct: 10, amount: "US$2.3B", growth: "+3.7%", sub: ["数据中心", "网络设备", "软件许可", "卫星通信", "网络安全"] },
    { name: "食品与农业", pct: 7, amount: "US$1.6B", growth: "-6.4%", sub: ["营养饼干", "强化面粉", "种子包", "灌溉设备", "储存设施"] },
    { name: "其他", pct: 7, amount: "US$1.6B", growth: "+1.1%", sub: ["运输物流", "纺织品", "办公用品", "燃料", "安保服务"] },
  ];
  const topSubs = [
    { name: "mRNA 疫苗", cat: "药品与疫苗", amount: "$2.45B" },
    { name: "呼吸机", cat: "医疗设备", amount: "$1.12B" },
    { name: "学校建设", cat: "建筑与工程", amount: "$980M" },
    { name: "口服补液盐", cat: "药品与疫苗", amount: "$860M" },
    { name: "超声诊断仪", cat: "医疗设备", amount: "$740M" },
    { name: "数据中心", cat: "ICT", amount: "$620M" },
    { name: "营养饼干", cat: "食品与农业", amount: "$510M" },
    { name: "供水系统", cat: "建筑与工程", amount: "$490M" },
    { name: "抗疟药", cat: "药品与疫苗", amount: "$430M" },
    { name: "网络设备", cat: "ICT", amount: "$380M" },
  ];
  return (
    <Modal open={open} onClose={onClose} title="UNSPSC 品类分布（2025）" className="max-w-2xl">
      {/* 主品类 */}
      <div className="space-y-2.5 mb-5">
        {mainCats.map((c) => (
          <div key={c.name} className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">{c.name}</span>
                <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${c.growth.startsWith("+") ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                  {c.growth}
                </span>
              </div>
              <span className="text-xs font-extrabold text-slate-900">{c.amount}</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-1.5">
              <div className="h-full bg-teal-500 rounded-full" style={{ width: `${c.pct}%` }} />
            </div>
            <div className="flex flex-wrap gap-1">
              {c.sub.map((s) => (
                <span key={s} className="text-2xs px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 热门子品类 TOP 10 */}
      <div>
        <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><Award className="w-3.5 h-3.5 text-amber-500" /> 热门采购子品类 TOP 10</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-1.5 text-slate-400 font-bold w-6">#</th>
                <th className="text-left py-1.5 text-slate-400 font-bold">子品类</th>
                <th className="text-left py-1.5 text-slate-400 font-bold">所属大类</th>
                <th className="text-right py-1.5 text-slate-400 font-bold">金额</th>
              </tr>
            </thead>
            <tbody>
              {topSubs.map((s, i) => (
                <tr key={s.name} className="border-b border-slate-50">
                  <td className="py-1.5 font-bold text-slate-400">{i + 1}</td>
                  <td className="py-1.5 font-bold text-slate-800">{s.name}</td>
                  <td className="py-1.5 text-slate-500">{s.cat}</td>
                  <td className="py-1.5 text-right font-bold text-slate-700">{s.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DataSource authoritative="UN ASR 2025（大类占比）/ UNSPSC 分类标准" analysis="增长率与子品类金额为平台分析模型" />
    </Modal>
  );
}

/* ── 3. 中标商名单弹窗 ── */
export function WinnersModal({ open, onClose, onViewSupplier }: {
  open: boolean; onClose: () => void; onViewSupplier: (s: SelectedSupplier) => void;
}) {
  const winners = [
    { rank: 1, name: "Siemens Healthineers AG", category: "医疗设备", level: "UNGM L2", certs: ["ISO 9001", "ISO 13485"], countries: "42" },
    { rank: 2, name: "McKesson Corporation", category: "药品分销", level: "UNGM L2", certs: ["ISO 9001", "WHO PQ"], countries: "28" },
    { rank: 3, name: "Cardinal Health Inc.", category: "医疗用品", level: "UNGM L1", certs: ["ISO 9001", "ISO 13485"], countries: "35" },
    { rank: 4, name: "B. Braun Melsungen AG", category: "医疗器械", level: "UNGM L2", certs: ["ISO 9001", "ISO 13485"], countries: "31" },
    { rank: 5, name: "Medtronic plc", category: "医疗设备", level: "UNGM L2", certs: ["ISO 9001", "ISO 13485"], countries: "38" },
    { rank: 6, name: "Johnson & Johnson", category: "药品/器械", level: "UNGM L2", certs: ["ISO 9001", "FDA"], countries: "45" },
    { rank: 7, name: "Roche Holding AG", category: "药品/诊断", level: "UNGM L2", certs: ["ISO 9001", "ISO 13485"], countries: "29" },
    { rank: 8, name: "Novartis AG", category: "药品", level: "UNGM L1", certs: ["ISO 9001", "WHO PQ"], countries: "26" },
  ];
  return (
    <Modal open={open} onClose={onClose} title="主要中标商完整名单（近12个月）" className="max-w-2xl">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 text-slate-400 font-bold w-6">#</th>
              <th className="text-left py-2 text-slate-400 font-bold">供应商</th>
              <th className="text-left py-2 text-slate-400 font-bold">品类</th>
              <th className="text-center py-2 text-slate-400 font-bold">UNGM 等级</th>
              <th className="text-center py-2 text-slate-400 font-bold">覆盖国家</th>
            </tr>
          </thead>
          <tbody>
            {winners.map((w) => (
              <tr key={w.rank} className="border-b border-slate-50 hover:bg-teal-50/30 cursor-pointer transition-colors" onClick={() => onViewSupplier(w)}>
                <td className="py-2 font-bold text-slate-400">{w.rank}</td>
                <td className="py-2">
                  <span className="font-bold text-teal-700 hover:underline">{w.name}</span>
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {w.certs.map((c) => (
                      <span key={c} className="text-2xs px-1 py-px rounded bg-slate-100 text-slate-500">{c}</span>
                    ))}
                  </div>
                </td>
                <td className="py-2 text-slate-600">{w.category}</td>
                <td className="py-2 text-center">
                  <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${w.level === "UNGM L2" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                    {w.level}
                  </span>
                </td>
                <td className="py-2 text-center text-slate-600">{w.countries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-2xs text-slate-400 mt-2 text-center">点击供应商名称查看详细档案</p>
      <DataSource authoritative="UNGM 供应商数据库" analysis="排名基于平台中标数据追踪模型" />
    </Modal>
  );
}

/* ── 4. 供应商详情弹窗 ─ */
export function SupplierModal({ open, onClose, supplier }: {
  open: boolean; onClose: () => void; supplier: SelectedSupplier | null;
}) {
  if (!supplier) return null;
  const certs = supplier.certs || ["ISO 9001", "UNGM L2"];
  const countries = supplier.countries || "30+";
  return (
    <Modal open={open} onClose={onClose} title={supplier.name} className="max-w-lg">
      {/* 头部 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center text-white font-extrabold text-sm">
          {supplier.name.charAt(0)}
        </div>
        <div>
          <p className="text-sm font-extrabold text-slate-900">{supplier.name}</p>
          <p className="text-2xs text-slate-500">{supplier.category} · {supplier.level || "UNGM 认证"}</p>
        </div>
      </div>

      {/* 资质 */}
      <div className="mb-4">
        <p className="text-xs font-bold text-slate-700 mb-2">企业资质认证</p>
        <div className="flex flex-wrap gap-1.5">
          {certs.map((c) => (
            <span key={c} className="text-2xs font-bold px-2 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-100">{c}</span>
          ))}
        </div>
      </div>

      {/* 覆盖区域 */}
      <div className="mb-4">
        <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><Globe className="w-3.5 h-3.5 text-teal-500" /> 业务覆盖</p>
        <div className="flex flex-wrap gap-1.5">
          {["欧洲", "北美", "亚太", "非洲", "拉美"].map((r) => (
            <span key={r} className="text-2xs px-2 py-1 rounded-lg bg-slate-100 text-slate-600">{r}</span>
          ))}
          <span className="text-2xs px-2 py-1 rounded-lg bg-teal-50 text-teal-700">{countries} 国</span>
        </div>
      </div>

      <DataSource authoritative="UNGM 供应商数据库 / 企业公开信息" />
    </Modal>
  );
}

/* ── 5. 采购日历弹窗 ── */
export function CalendarModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const months = getLast12Months();
  const values = TREND_DATA.map((d) => d.count);
  const amounts = TREND_DATA.map((d) => d.amount);
  const maxVal = Math.max(...values);

  // 季度汇总
  const quarters = [
    { name: "Q1", months: months.slice(0, 3), values: values.slice(0, 3), amounts: amounts.slice(0, 3) },
    { name: "Q2", months: months.slice(3, 6), values: values.slice(3, 6), amounts: amounts.slice(3, 6) },
    { name: "Q3", months: months.slice(6, 9), values: values.slice(6, 9), amounts: amounts.slice(6, 9) },
    { name: "Q4", months: months.slice(9, 12), values: values.slice(9, 12), amounts: amounts.slice(9, 12) },
  ];
  const qTotals = quarters.map((q) => ({ name: q.name, count: q.values.reduce((a, b) => a + b, 0), amount: q.amounts.reduce((a, b) => a + b, 0) }));
  const maxQ = Math.max(...qTotals.map((q) => q.count));

  // 环比
  const momChanges = values.map((v, i) => i === 0 ? 0 : ((v - values[i - 1]) / values[i - 1] * 100));

  const insights = [
    { quarter: "Q1", text: "偏低 — 新年预算审批期，采购节奏放缓", color: "text-slate-500" },
    { quarter: "Q2", text: "上升 — 预算释放，项目集中启动", color: "text-blue-500" },
    { quarter: "Q3", text: "高峰 — 财年执行加速，招标密集期", color: "text-teal-600" },
    { quarter: "Q4", text: "峰值 — 财年预算执行期，年末冲刺采购", color: "text-emerald-600" },
  ];

  return (
    <Modal open={open} onClose={onClose} title="年度采购日历与趋势分析" className="max-w-2xl">
      {/* 月度热力图 */}
      <div className="mb-5">
        <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-teal-500" /> 月度中标项目数热力图</p>
        <div className="grid grid-cols-6 gap-2">
          {months.map((m, i) => {
            const intensity = values[i] / maxVal;
            const bg = intensity > 0.85 ? "bg-teal-600" : intensity > 0.65 ? "bg-teal-500" : intensity > 0.45 ? "bg-teal-400" : intensity > 0.25 ? "bg-teal-200" : "bg-teal-100";
            const change = momChanges[i];
            return (
              <div key={m} className="text-center">
                <div className={`h-12 rounded-lg ${bg} flex flex-col items-center justify-center mb-1 relative`}>
                  <span className="text-xs font-bold text-white">{values[i]}</span>
                  {change !== 0 && (
                    <span className={`text-2xs font-bold ${change > 0 ? "text-emerald-200" : "text-red-200"}`}>
                      {change > 0 ? "↑" : "↓"}{Math.abs(change).toFixed(0)}%
                    </span>
                  )}
                </div>
                <p className="text-2xs text-slate-500">{m}</p>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-3 mt-3 text-2xs text-slate-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-100 inline-block" /> 低</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-200 inline-block" /> 较低</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-400 inline-block" /> 中</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-500 inline-block" /> 高</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-600 inline-block" /> 峰值</span>
        </div>
      </div>

      {/* 季度对比 */}
      <div className="mb-5">
        <p className="text-xs font-bold text-slate-700 mb-2">季度对比</p>
        <div className="grid grid-cols-4 gap-3">
          {qTotals.map((q) => (
            <div key={q.name} className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-lg font-extrabold text-teal-600">{q.count}</p>
              <p className="text-2xs text-slate-500">项目数</p>
              <p className="text-xs font-bold text-slate-700 mt-1">${q.amount.toFixed(1)}B</p>
              <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(q.count / maxQ) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 业务洞察 */}
      <div>
        <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-amber-500" /> 季节性业务洞察</p>
        <div className="space-y-2">
          {insights.map((ins) => (
            <div key={ins.quarter} className="flex items-start gap-2 bg-slate-50 rounded-lg p-2.5">
              <span className={`text-xs font-extrabold ${ins.color} w-8 shrink-0`}>{ins.quarter}</span>
              <span className="text-xs text-slate-600">{ins.text}</span>
            </div>
          ))}
        </div>
      </div>

      <DataSource authoritative="UN ASR 2025（年度总额与季度分布）" analysis="月度明细与环比变化为平台分析模型" />
    </Modal>
  );
}

/* ── 6. 设置提醒弹窗 ─ */
export function ReminderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [agencies, setAgencies] = useState("UNICEF");
  const [categories, setCategories] = useState("医疗耗材, 疫苗");
  const [regions, setRegions] = useState("全球");
  const [frequency, setFrequency] = useState("weekly");

  return (
    <Modal open={open} onClose={onClose} title="设置采购提醒" className="max-w-lg">
      <div className="mb-4 p-3 rounded-lg bg-teal-50 border border-teal-100">
        <p className="text-xs font-bold text-teal-700 flex items-center gap-1.5"><Bell className="w-4 h-4" /> 订阅说明</p>
        <p className="text-2xs text-teal-600 mt-1">订阅后将在新公告发布时通过邮件 / 站内信通知您。可按机构、品类、地区、预算等条件精准筛选。</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-700 mb-1 block">关注机构</label>
          <input value={agencies} onChange={(e) => setAgencies(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="如 UNICEF, WHO, WFP" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-700 mb-1 block">关注品类（UNSPSC）</label>
          <input value={categories} onChange={(e) => setCategories(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="如 医疗耗材, 疫苗, 检验设备" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">关注地区</label>
            <input value={regions} onChange={(e) => setRegions(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="如 非洲, 东南亚" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">通知频率</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
              <option value="realtime">实时推送</option>
              <option value="daily">每日汇总</option>
              <option value="weekly">每周汇总</option>
              <option value="monthly">每月汇总</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-3 justify-end mt-5 pt-4 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">取消</button>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white transition-colors">确认订阅</button>
      </div>
    </Modal>
  );
}

function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-2xs text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${highlight ? "text-emerald-700" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

/* ── 7. 中国企业联合国采购中标案例详情弹窗 ── */
export function CnCaseDetailModal({ open, onClose, caseItem }: { open: boolean; onClose: () => void; caseItem: CnAwardCase | null }) {
  if (!caseItem) return null;
  const fmtAmount = caseItem.amountUSD ? `USD ${caseItem.amountUSD.toLocaleString()}` : caseItem.amountText;
  return (
    <Modal open={open} onClose={onClose} title={`案例 #${caseItem.id}：${caseItem.winnerCN}`} className="max-w-2xl">
      <div className="space-y-4 text-sm">
        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-3">
          <Info label="UN机构" value={caseItem.agency} />
          <Info label="合同编号" value={caseItem.contractNo} />
          <Info label="日期" value={caseItem.date} />
          <Info label="协议类型" value={caseItem.agreementType} />
          <Info label="中标金额" value={fmtAmount} highlight />
          <Info label="覆盖范围" value={caseItem.coverage} />
        </div>
        {/* 采购内容 */}
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">采购内容</p>
          <p className="text-sm font-bold text-slate-800">{caseItem.content}</p>
        </div>
        {/* 中标企业 */}
        <div className="p-3 rounded-lg bg-teal-50 border border-teal-100">
          <p className="text-xs font-bold text-teal-700 mb-1">中标企业</p>
          <p className="text-sm font-bold text-slate-800">{caseItem.winnerCN}</p>
          <p className="text-2xs text-slate-500 mt-0.5">{caseItem.winnerEN}</p>
        </div>
        {/* 中标原因 */}
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">中标原因分析</p>
          <p className="text-sm text-slate-700 leading-relaxed">{caseItem.reason}</p>
        </div>
        {/* 证据等级 + 来源 */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            caseItem.evidenceLevel.includes("A+") ? "bg-emerald-100 text-emerald-700" :
            caseItem.evidenceLevel === "A" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
          }`}>证据等级 {caseItem.evidenceLevel}</span>
          <span className="text-xs text-slate-400">来源：{caseItem.agency} 官方合同公示</span>
        </div>
      </div>
    </Modal>
  );
}
