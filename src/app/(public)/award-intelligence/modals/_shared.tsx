"use client";

/**
 * 中标情报弹窗集合 — 通用展示件（自 Modals.tsx 拆出，行为不变）。
 *
 * @module app/(public)/award-intelligence/modals/_shared
 */
import { memo } from "react";

/** 通用弹窗底部数据来源（分层标注） */
export const DataSource = memo(function DataSource({ authoritative, analysis }: { authoritative: string; analysis?: string }) {
  return (
    <div className="mt-4 pt-3 border-t border-slate-100 text-center space-y-0.5">
      <p className="text-2xs text-slate-400">权威数据：{authoritative}</p>
      {analysis && <p className="text-2xs text-slate-300">分析数据：{analysis}</p>}
    </div>
  );
});

/** 通用指标卡片 */
export const MetricCard = memo(function MetricCard({ label, value, color = "text-slate-900" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <p className={`text-lg font-extrabold ${color}`}>{value}</p>
      <p className="text-2xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
});

/** 键值信息行 */
export const Info = memo(function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-2xs text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${highlight ? "text-emerald-700" : "text-slate-800"}`}>{value}</p>
    </div>
  );
});
