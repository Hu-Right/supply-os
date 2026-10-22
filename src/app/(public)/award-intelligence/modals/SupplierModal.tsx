"use client";

/**
 * 供应商详情弹窗：仅展示真实字段，资质/覆盖等待接入（删除硬编码 ISO/区域）。
 *
 * @module app/(public)/award-intelligence/modals/SupplierModal
 */
import { memo } from "react";
import { Modal } from "@/shared/ui";
import type { WinnerRow } from "@/features/procurement/awards/awardViewModel";

export const SupplierModal = memo(function SupplierModal({ open, onClose, supplier }: { open: boolean; onClose: () => void; supplier: WinnerRow | null }) {
  if (!supplier) return null;
  return (
    <Modal open={open} onClose={onClose} title={supplier.name} className="max-w-lg">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center text-white font-extrabold text-sm">{supplier.name.charAt(0)}</div>
        <div>
          <p className="text-sm font-extrabold text-slate-900">{supplier.name}</p>
          <p className="text-2xs text-slate-500">{supplier.country ?? "国别待补"}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-50 rounded-lg p-3 text-center"><p className="text-lg font-extrabold text-teal-600">{supplier.count}</p><p className="text-2xs text-slate-500 mt-0.5">中标次数</p></div>
        <div className="bg-slate-50 rounded-lg p-3 text-center"><p className="text-lg font-extrabold text-slate-700">{supplier.totalUsd > 0 ? `US$${(supplier.totalUsd / 1e6).toFixed(1)}M` : "未公开"}</p><p className="text-2xs text-slate-500 mt-0.5">累计金额</p></div>
      </div>
      <p className="text-2xs text-slate-400">资质认证、业务覆盖等信息待后续接入。</p>
    </Modal>
  );
});
