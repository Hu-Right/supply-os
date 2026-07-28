/**
 * 学习材料卡片组件
 * Learning Material Card Component
 *
 * @module features/learning/components/MaterialCard
 * @description 单个学习材料展示卡片，支持下载和 VIP 锁定
 *              Single learning material card with download and VIP lock support
 */

import { AlertCircle, CheckCircle2, FileDown } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import type { LearningMaterial } from "@/types";

export interface MaterialCardProps {
  material: LearningMaterial;
  isVip: boolean;
  onDownload: (fileUrl: string, fileName: string, materialId: string) => void;
  onUpgradeClick: () => void;
}

export function MaterialCard({ material, isVip, onDownload, onUpgradeClick }: MaterialCardProps) {
  const { t, locale } = useLocale();

  const isLocked = material.isPremium && !isVip;

  return (
    <div className="relative space-y-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 transition-all hover:border-teal-200 hover:shadow-sm">
      {material.isPremium && (
        <div className="absolute end-0 top-0">
          <span className="rounded-es bg-gradient-to-tr from-amber-500 to-amber-600 px-2.5 py-1 text-[9px] font-black text-slate-900">
            {t("membershipRequired")}
          </span>
        </div>
      )}

      <div className="flex items-center space-x-2">
        <span className="rounded border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-700">
          {pickLocale(locale, material.categoryZh, material.categoryEn)}
        </span>
        <span className="text-[11px] text-slate-400">
          {t("learningDownloadCount", { num: material.downloadsCount })}
        </span>
      </div>

      <h4 className="pe-16 text-sm font-bold text-slate-800">
        {pickLocale(locale, material.titleZh, material.titleEn)}
      </h4>

      <p className="rounded border border-slate-100 bg-white p-3 text-xs leading-relaxed text-slate-500">
        <strong>{t("learningSummary")}:</strong>{" "}
        {pickLocale(locale, material.summaryZh, material.summaryEn)}
      </p>

      {isLocked ? (
        <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 md:flex-row md:items-center">
          <div className="flex items-start space-x-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <span>{t("lockedPremium")}</span>
          </div>
          <button
            onClick={onUpgradeClick}
            className="cursor-pointer rounded bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-slate-900 transition-colors hover:bg-amber-600"
          >
            {t("upgradeToVip")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {material.isPremium && (
            <div className="flex items-center space-x-2 rounded border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{t("unlockedPremium")}</span>
            </div>
          )}

          <div className="max-h-36 overflow-auto rounded-lg bg-slate-100 p-3 font-mono text-xs leading-relaxed text-slate-700">
            <strong className="mb-1 block text-[10px] font-bold uppercase text-slate-400">
              {t("learningCoreContent")}
            </strong>
            {pickLocale(locale, material.contentZh, material.contentEn)}
          </div>

          <div className="flex justify-end gap-2 pt-1 text-xs">
            <button
              onClick={() =>
                onDownload(
                  material.fileUrl ?? "",
                  material.fileName ?? material.titleZh,
                  material.id
                )
              }
              disabled={!material.fileUrl}
              className="flex cursor-pointer items-center space-x-1.5 rounded bg-slate-900 px-3.5 py-1.5 font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FileDown className="h-3.5 w-3.5 text-teal-400" />
              <span>{t("downloadBtn")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

MaterialCard.displayName = "MaterialCard";
