"use client";

/**
 * 供应商资源库 — 添加面板（自 page-client.tsx 拆出，JSX 逐字不变）。
 *
 * 展示组件：两段式添加（候选点选优先、未命中手动新建）的全部 UI 状态由容器持有并下传；
 * 已套 memo——容器内列表轮询/备注输入等无关状态变化不再重渲本面板
 * （回调均由容器 useCallback 稳定）。
 *
 * @module app/(public)/settings/supplier-pool/components/AddPanel
 */
import { memo } from "react";
import { AlertCircle } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { PoolCandidate } from "./types";

export const AddPanel = memo(function AddPanel({
  companyName,
  onCompanyNameChange,
  onAdd,
  addLoading,
  addMessage,
  addError,
  candidates,
  searching,
  searched,
  addByIdLoading,
  onAddById,
}: {
  companyName: string;
  onCompanyNameChange: (v: string) => void;
  onAdd: () => void;
  addLoading: boolean;
  addMessage: string;
  addError: boolean;
  candidates: PoolCandidate[];
  searching: boolean;
  searched: boolean;
  addByIdLoading: number | null;
  onAddById: (supplierId: number, companyName: string) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50/30 p-4 space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={companyName}
          onChange={(e) => onCompanyNameChange(e.target.value)}
          placeholder={t("supplierPoolCompanyName") || "输入公司名称"}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none"
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={addLoading || !companyName.trim()}
          className="rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-bold transition-colors"
        >
          {addLoading ? "..." : t("supplierPoolAdd") || "添加"}
        </button>
      </div>
      {addMessage && (
        <p className={`text-xs ${addError ? "text-rose-600" : "text-emerald-600"} flex items-center gap-1`}>
          {addError && <AlertCircle className="w-3 h-3" />}
          {addMessage}
        </p>
      )}

      {/* 候选列表：平台目录命中项点选确认，避免模糊匹配误加 */}
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
                  disabled={!!c.in_pool || addByIdLoading !== null}
                  onClick={() => onAddById(c.id, c.company)}
                  className="w-full flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-purple-300 hover:bg-purple-50/40 disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:bg-white transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{c.company}</p>
                    {c.industry && <p className="text-2xs text-slate-500">{c.industry}</p>}
                  </div>
                  {c.in_pool ? (
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
              {t("supplierPoolNoCandidate") || "没有匹配的平台供应商"}
            </p>
          )}
          {!searching && companyName.trim() && (
            <button
              type="button"
              onClick={onAdd}
              disabled={addLoading}
              className="w-full flex items-center justify-center gap-1 rounded-lg border border-dashed border-purple-300 bg-white px-3 py-2 text-2xs font-bold text-purple-600 hover:bg-purple-50/40 disabled:opacity-50 transition-colors"
            >
              {addLoading ? "…" : (t("supplierPoolCreateAnyway") || "未找到匹配？仍要添加「{name}」").replace("{name}", companyName.trim())}
            </button>
          )}
        </div>
      )}

      <p className="text-2xs text-slate-500">
        {t("supplierPoolAddHint") || "输入公司名称后，系统会自动匹配平台供应商目录。未匹配到的公司会创建基础记录，你可以后续补充诊断信息。"}
      </p>
    </div>
  );
});
