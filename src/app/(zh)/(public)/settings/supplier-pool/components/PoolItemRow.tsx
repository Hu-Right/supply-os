"use client";

/**
 * 供应商资源库 — 列表行卡片（自 page-client.tsx 拆出）。
 *
 * 展示组件：备注编辑态由容器持有（editing/editNotes）并下传；
 * memo 使非编辑行的重渲与「某行进入编辑」解耦（其余行 props 未变即跳过）。
 *
 * [2026-11-29] 去掉行内「资质诊断」图标入口：诊断属于投标服务，放在供应商库里
 * 既打断信息架构，也会让头部导航跳到「投标服务」分组。现在点击行主体进入
 * 供应商详情页（/supplier/{id}），诊断入口统一留在供应商库/详情页的对应位置。
 *
 * @module app/(public)/settings/supplier-pool/components/PoolItemRow
 */
import { memo } from "react";
import Link from "next/link";
import { Edit3, Trash2, Check, X } from "lucide-react";
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
  // 只有信息审核通过的供应商才有公开详情页（/supplier/{id} 对未审核档案返回 404）
  const detailHref =
    item.supplierId !== null && item.infoReviewStatus === "reviewed" ? `/supplier/${item.supplierId}` : null;

  const heading = (
    <>
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-slate-800 truncate group-hover:text-purple-700 transition-colors">
          {item.company || "未知"}
        </p>
        {item.hasQualification ? (
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
    </>
  );

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {detailHref ? (
            <Link href={detailHref} className="block group">
              {heading}
            </Link>
          ) : (
            <div>{heading}</div>
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
              <button onClick={() => onSaveNotes(item.poolId)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
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
