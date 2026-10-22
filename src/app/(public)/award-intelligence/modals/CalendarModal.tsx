"use client";

/**
 * 采购日历弹窗：真实按月中标项目数热力；无假季度金额/假业务洞察。
 *
 * @module app/(public)/award-intelligence/modals/CalendarModal
 */
import { memo } from "react";
import { Modal, EmptyState } from "@/shared/ui";
import type { Section, TrendSeries } from "@/features/procurement/awards/awardViewModel";

export const CalendarModal = memo(function CalendarModal({ open, onClose, trend }: { open: boolean; onClose: () => void; trend: Section<TrendSeries> }) {
  if (!trend.present) {
    return (
      <Modal open={open} onClose={onClose} title="采购日历与趋势" className="max-w-xl">
        <EmptyState title="暂无趋势数据" description={trend.reason} />
      </Modal>
    );
  }
  const { months, counts } = trend.data;
  const max = Math.max(...counts, 1);
  return (
    <Modal open={open} onClose={onClose} title="采购日历与趋势" className="max-w-xl">
      <p className="text-xs font-bold text-slate-700 mb-2">月度中标项目数</p>
      <div className="grid grid-cols-6 gap-2">
        {months.map((m, i) => {
          const it = counts[i] / max;
          const bg = it > 0.85 ? "bg-teal-600" : it > 0.65 ? "bg-teal-500" : it > 0.45 ? "bg-teal-400" : it > 0.25 ? "bg-teal-200" : "bg-teal-100";
          return (
            <div key={m} className="text-center">
              <div className={`h-12 rounded-lg ${bg} flex items-center justify-center mb-1`}>
                <span className="text-xs font-bold text-white">{counts[i]}</span>
              </div>
              <p className="text-2xs text-slate-500">{m}</p>
            </div>
          );
        })}
      </div>
      {!Array.isArray(trend.data.amountsUsd) && (
        <p className="text-2xs text-slate-400 mt-3">中标金额未公开（来源未提供），仅统计项目数。</p>
      )}
    </Modal>
  );
});
