"use client";

/**
 * 供应商资源库 — 列表行卡片（自 page-client.tsx 拆出，JSX 逐字不变）。
 *
 * 展示组件：备注编辑态由容器持有（editing/editNotes）并下传；
 * memo 使非编辑行的重渲与「某行进入编辑」解耦（其余行 props 未变即跳过）。
 *
 * @module app/(public)/settings/supplier-pool/components/PoolItemRow
 */
import { memo } from "react";
import { ShieldAlert, Edit3, Trash2, Check, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { PoolItem } from "./types";

export const PoolItemRow = memo(function PoolItemRow({
  item,
  editing,
  editNotes,
  onEditNotesChange,
  onSaveNotes,
  onCancelEdit,
  onStartEdit,
  onRemove,
}: {
  item: PoolItem;
  editing: boolean;
  editNotes: string;
  onEditNotesChange: (v: string) => void;
  onSaveNotes: (poolId: number) => void;
  onCancelEdit: () => void;
  onStartEdit: (item: PoolItem) => void;
  onRemove: (item: PoolItem) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-800 truncate">{item.company || "未知"}</p>
            {item.has_qualification ? (
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-2xs font-bold">
                {t("supplierPoolDiagDone") || "已完善"}
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-2xs font-bold">
                {t("supplierPoolDiagPending") || "待完善"}
              </span>
            )}
          </div>
          {item.industry && (
            <p className="text-2xs text-slate-500 mt-0.5">{item.industry}</p>
          )}
          {editing ? (
            <div className="flex items-center gap-1.5 mt-2">
              <input
                type="text"
                value={editNotes}
                onChange={(e) => onEditNotesChange(e.target.value)}
                className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-purple-400"
                placeholder={t("supplierPoolNotes") || "备注"}
              />
              <button onClick={() => onSaveNotes(item.pool_id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={onCancelEdit} className="p-1 text-slate-400 hover:bg-slate-50 rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            item.notes && <p className="text-2xs text-slate-400 mt-0.5 truncate">{item.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <a
            href="/procurement/diagnosis"
            className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded transition-colors"
            title={item.has_qualification
              ? (t("supplierPoolUpdateDiag") || "更新诊断表")
              : (t("supplierPoolFillDiag") || "填写诊断表")}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => onStartEdit(item)}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition-colors"
            title={t("supplierPoolEditNotes") || "编辑备注"}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRemove(item)}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
            title={t("supplierPoolRemove") || "移除"}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});
