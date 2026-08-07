/**
 * 展厅卡片组件
 * Showroom Card Component
 *
 * @module features/showroom/components/ShowroomCard
 * @description 单个展厅展示卡片
 *              Single showroom display card
 */

import { Clock } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import type { ExhibitionHall } from "@/types";

export interface ShowroomCardProps {
  showroom: ExhibitionHall;
  onApply: (showroom: ExhibitionHall) => void;
  onConsult: (showroom: ExhibitionHall) => void;
}

export function ShowroomCard({ showroom, onApply, onConsult }: ShowroomCardProps) {
  const { t, locale } = useLocale();

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-all duration-300 hover:border-teal-500/55 hover:shadow-md">
      {/* Banner Image with Badge */}
      <div className="relative h-36 md:h-48 w-full overflow-hidden bg-slate-100">
        <img
          src={showroom.bannerUrl}
          alt={pickLocale(locale, showroom.nameZh, showroom.nameEn)}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-550 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
        <div className="absolute start-4 top-4 rounded-full bg-teal-600 px-3 py-1 text-xs font-bold text-white shadow-xs">
          {pickLocale(locale, showroom.regionZh, showroom.regionEn)} ·{" "}
          {pickLocale(locale, showroom.countryZh, showroom.countryEn)}
        </div>
        <div className="absolute bottom-4 left-4 right-4 text-white">
          <p className="line-clamp-1 text-xl font-bold">
            {pickLocale(locale, showroom.nameZh, showroom.nameEn)}
          </p>
          <p className="mt-0.5 flex items-center text-xs text-slate-200">
            <Clock className="me-1 h-3.5 w-3.5 text-teal-400" />
            <span>
              {t("capacityLabel")}: {showroom.capacityValue}
            </span>
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col justify-between p-5">
        <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-slate-600">
          {pickLocale(locale, showroom.descriptionZh, showroom.descriptionEn)}
        </p>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {t("featuredProducts")}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pickLocale(locale, showroom.featuredProductsZh, showroom.featuredProductsEn).map(
                (prod, idx) => (
                  <span
                    key={idx}
                    className="rounded-md border border-slate-200/50 bg-slate-100 px-2.5 py-1 text-[11px] text-slate-800"
                  >
                    {prod}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => onApply(showroom)}
              className="flex-1 cursor-pointer rounded-lg bg-slate-900 py-2 text-center text-xs font-bold text-white shadow-sm transition-colors group-hover:bg-teal-600"
            >
              {t("showroomApplyBtn")}
            </button>
            <button
              onClick={() => onConsult(showroom)}
              className="cursor-pointer rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-teal-50 hover:text-teal-600"
              title={t("showroomConsultTitle")}
            >
              {t("showroomConsultBtn")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

ShowroomCard.displayName = "ShowroomCard";
