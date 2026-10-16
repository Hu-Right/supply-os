"use client";

/**
 * 机构画像详情弹窗（自 Modals.tsx 拆出，数据与 JSX 逐字不变）。
 *
 * @module app/(public)/award-intelligence/modals/AgencyModal
 */
import { memo } from "react";
import { TrendingUp, CheckCircle2, AlertCircle } from "lucide-react";
import { Modal } from "@/shared/ui";
import { DataSource, MetricCard } from "./_shared";

/* ── 机构画像详情弹窗 ── */
export const AgencyModal = memo(function AgencyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
});
