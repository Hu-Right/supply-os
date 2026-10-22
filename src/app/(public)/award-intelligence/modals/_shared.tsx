"use client";

/**
 * 中标情报弹窗集合 — 通用展示件（自 Modals.tsx 拆出，行为不变）。
 *
 * @module app/(public)/award-intelligence/modals/_shared
 */
import { memo } from "react";

/** 键值信息行 */
export const Info = memo(function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-2xs text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${highlight ? "text-emerald-700" : "text-slate-800"}`}>{value}</p>
    </div>
  );
});
