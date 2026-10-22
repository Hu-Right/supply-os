"use client";

/**
 * 中标商名单弹窗：真实 topWinners（按中标次数），无则诚实空态（删除假 Siemens 名单）。
 *
 * @module app/(public)/award-intelligence/modals/WinnersModal
 */
import { memo } from "react";
import { Modal, EmptyState } from "@/shared/ui";
import type { Section, WinnerRow } from "@/features/procurement/awards/awardViewModel";

export const WinnersModal = memo(function WinnersModal({ open, onClose, section, onViewSupplier }: {
  open: boolean; onClose: () => void; section: Section<WinnerRow[]>; onViewSupplier: (w: WinnerRow) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="中标商名单" className="max-w-xl">
      {section.present ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 text-slate-400 font-bold">#</th>
                <th className="text-left py-2 text-slate-400 font-bold">供应商</th>
                <th className="text-left py-2 text-slate-400 font-bold">国别</th>
                <th className="text-center py-2 text-slate-400 font-bold">中标次数</th>
              </tr>
            </thead>
            <tbody>
              {section.data.map((w) => (
                <tr key={w.rank} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50/50" onClick={() => onViewSupplier(w)}>
                  <td className="py-2 font-bold text-slate-400">{w.rank}</td>
                  <td className="py-2 font-bold text-teal-700">{w.name}</td>
                  <td className="py-2 text-slate-500">{w.country ?? "—"}</td>
                  <td className="py-2 text-center font-bold text-slate-600">{w.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-2xs text-slate-400 mt-2">中标商数据清洗进行中，名称以来源公示原文为准</p>
        </div>
      ) : (
        <EmptyState title="暂无中标商" description={section.reason} />
      )}
    </Modal>
  );
});
