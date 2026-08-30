/**
 * 学习材料卡片组件
 * Learning Material Card Component
 *
 * @module features/learning/components/MaterialCard
 * @description 单个学习材料展示卡片，支持购买后下载
 *              Single learning material card with purchase and download support
 */

import { useEffect, useState } from "react";
import { FileDown, Lock } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { Button } from "@/shared/ui";
import type { LearningMaterial } from "@/types";

export interface MaterialCardProps {
  material: LearningMaterial;
  isPurchased: boolean;
  onDownload: (fileUrl: string, fileName: string, materialId: string) => void;
  onBuyMaterial: (material: LearningMaterial) => void;
}

export function MaterialCard({ material, isPurchased, onDownload, onBuyMaterial }: MaterialCardProps) {
  const { t, locale } = useLocale();
  const displayPrice = material.price != null ? `¥${material.price.toFixed(1)}` : "";

  // premium 资料的正文不随列表下发：已购用户按需从 /content 端点加载
  const [premiumContent, setPremiumContent] = useState<{ contentZh: string; contentEn: string } | null>(null);
  const needsContentFetch = material.isPremium && isPurchased;
  useEffect(() => {
    if (!needsContentFetch) return;
    let cancelled = false;
    void api<{ contentZh: string; contentEn: string }>(
      `/api/learning/materials/${encodeURIComponent(material.id)}/content`,
    )
      .then((d) => {
        if (!cancelled) setPremiumContent({ contentZh: d.contentZh ?? "", contentEn: d.contentEn ?? "" });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsContentFetch, material.id]);

  const contentText = material.isPremium
    ? isPurchased
      ? pickLocale(locale, premiumContent?.contentZh ?? "", premiumContent?.contentEn ?? "")
      : ""
    : pickLocale(locale, material.contentZh, material.contentEn);
  const contentLocked = material.isPremium && !isPurchased;
  // 已购 premium 资料的 fileUrl 为空，但可经 /content 端点按需获取，不禁用按钮
  const downloadDisabled = !material.fileUrl && !(material.isPremium && isPurchased);

  return (
    <div className="relative space-y-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 transition-all hover:border-teal-200 hover:shadow-sm">
      {material.number != null && (
        <span className="absolute -left-0 -top-0 flex h-7 w-7 items-center justify-center rounded-br-lg bg-teal-600 text-xs font-black text-white shadow-sm">
          {material.number}
        </span>
      )}

      <div className="flex items-center space-x-2 pt-1">
        <span className="rounded border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-700">
          {pickLocale(locale, material.categoryZh, material.categoryEn)}
        </span>
        <span className="text-[11px] text-slate-400">
          {t("learningDownloadCount", { num: material.downloadsCount })}
        </span>
      </div>

      <h4 className="text-sm font-bold text-slate-800">
        {pickLocale(locale, material.titleZh, material.titleEn)}
      </h4>

      <p className="rounded border border-slate-100 bg-white p-3 text-xs leading-relaxed text-slate-500">
        <strong>{t("learningSummary")}:</strong>{" "}
        {pickLocale(locale, material.summaryZh, material.summaryEn)}
      </p>

      {contentLocked ? (
        <div className="flex max-h-36 items-center justify-center gap-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5 text-slate-400" />
          <span>{t("learningContentLocked")}</span>
        </div>
      ) : (
        <div className="max-h-36 overflow-auto rounded-lg bg-slate-100 p-3 font-mono text-xs leading-relaxed text-slate-700">
          <strong className="mb-1 block text-[10px] font-bold uppercase text-slate-400">
            {t("learningCoreContent")}
          </strong>
          {contentText}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1 text-xs">
        {isPurchased ? (
          <Button
            onClick={() =>
              onDownload(
                material.fileUrl ?? "",
                material.fileName ?? material.titleZh,
                material.id
              )
            }
            disabled={downloadDisabled}
            size="sm"
            className="px-4 py-2 gap-1.5 disabled:opacity-40 whitespace-nowrap cursor-pointer"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>{t("downloadBtn")}</span>
          </Button>
        ) : (
          <Button
            onClick={() => onBuyMaterial(material)}
            size="sm"
            className="px-4 py-2 gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {displayPrice || t("buyMaterialBtn")}
          </Button>
        )}
      </div>
    </div>
  );
}

MaterialCard.displayName = "MaterialCard";
