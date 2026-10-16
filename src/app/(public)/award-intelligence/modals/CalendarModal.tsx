"use client";

/**
 * 采购日历弹窗（自 Modals.tsx 拆出，数据与 JSX 逐字不变）。
 *
 * @module app/(public)/award-intelligence/modals/CalendarModal
 */
import { memo } from "react";
import { Calendar, TrendingUp } from "lucide-react";
import { Modal } from "@/shared/ui";
import { getLast12Months, TREND_DATA } from "../curatedData";
import { DataSource } from "./_shared";

/* ── 采购日历弹窗 ── */
export const CalendarModal = memo(function CalendarModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
});
