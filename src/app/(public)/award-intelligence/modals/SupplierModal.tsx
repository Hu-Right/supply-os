"use client";

/**
 * 供应商详情弹窗（自 Modals.tsx 拆出，数据与 JSX 逐字不变）。
 *
 * @module app/(public)/award-intelligence/modals/SupplierModal
 */
import { memo } from "react";
import { Globe } from "lucide-react";
import { Modal } from "@/shared/ui";
import type { SelectedSupplier } from "../curatedData";
import { DataSource } from "./_shared";

/* ── 供应商详情弹窗 ── */
export const SupplierModal = memo(function SupplierModal({ open, onClose, supplier }: {
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
});
