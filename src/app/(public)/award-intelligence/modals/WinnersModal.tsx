"use client";

/**
 * 中标商名单弹窗（自 Modals.tsx 拆出，数据与 JSX 逐字不变）。
 *
 * @module app/(public)/award-intelligence/modals/WinnersModal
 */
import { memo } from "react";
import { Modal } from "@/shared/ui";
import type { SelectedSupplier } from "../curatedData";
import { DataSource } from "./_shared";

/* ── 中标商名单弹窗 ── */
export const WinnersModal = memo(function WinnersModal({ open, onClose, onViewSupplier }: {
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
});
