"use client";

/**
 * 供应商资源库 — 添加面板（入口收敛后只剩「平台目录搜索 + 点选添加」）。
 *
 * [2026-11-29] 按产品规则移除手动新建：不再支持输入公司名直接建记录，
 * 只能搜索平台目录并点选已有供应商，保证池内每一行都能打开公开详情页。
 *
 * @module app/(public)/settings/supplier-pool/components/AddPanel
 */
import { memo } from "react";
import { useLocale } from "@/core/i18n";
import type { PoolCandidate } from "./types";

export const AddPanel = memo(function AddPanel({
  companyName,
  onCompanyNameChange,
  candidates,
  searching,
  searched,
  addByIdLoading,
  onAddById,
}: {
  companyName: string;
  onCompanyNameChange: (v: string) => void;
  candidates: PoolCandidate[];
  searching: boolean;
  searched: boolean;
  addByIdLoading: number | null;
  onAddById: (supplierId: number, companyName: string) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50/30 p-4 space-y-3">
      <input
        type="text"
        value={companyName}
        onChange={(e) => onCompanyNameChange(e.target.value)}
        placeholder={t("supplierPoolCompanyName") || "搜索平台供应商目录"}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none"
      />

      {/* 候选列表：只允许点选平台目录中已存在的供应商 */}
      {companyName.trim().length >= 2 && (
        <div className="space-y-1">
          {searching && (
            <p className="text-2xs text-slate-400">{t("supplierPoolSearching") || "搜索中…"}</p>
          )}
          {!searching && candidates.length > 0 && (
            <>
              <p className="text-2xs font-bold text-slate-500">
                {t("supplierPoolCandidatesTitle") || "平台目录候选（点选添加）"}
              </p>
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={!!c.inPool || addByIdLoading !== null}
                  onClick={() => onAddById(c.id, c.company)}
                  className="w-full flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-purple-300 hover:bg-purple-50/40 disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:bg-white transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{c.company}</p>
                    {c.industry && <p className="text-2xs text-slate-500">{c.industry}</p>}
                  </div>
                  {c.inPool ? (
                    <span className="text-2xs text-emerald-600 border border-emerald-200 bg-emerald-50 rounded px-1.5 py-0.5">
                      {t("supplierPoolAlreadyInPool") || "已添加"}
                    </span>
                  ) : (
                    <span className="text-2xs text-purple-600 font-bold">
                      {addByIdLoading === c.id ? "…" : (t("supplierPoolAdd") || "添加")}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
          {!searching && searched && candidates.length === 0 && (
            <p className="text-2xs text-slate-400">
              {t("supplierPoolNoCandidate") || "平台目录里没有匹配的供应商"}
            </p>
          )}
        </div>
      )}

      <p className="text-2xs text-slate-500">
        {t("supplierPoolAddHint") || "只能从平台供应商目录添加：输入公司名后点选候选。"}
      </p>
    </div>
  );
});
