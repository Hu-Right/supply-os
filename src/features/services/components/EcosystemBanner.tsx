/**
 * 服务市场 → 第三方服务生态 引流横幅
 * Ecosystem Banner
 *
 * @module features/services/components/EcosystemBanner
 * @description 2026-11-20 生态独立成 /ecosystem 模块后，/services 页保留一个
 *              入口横幅承接引流（研修培训/合规/履约/售后/本地化伙伴）。
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLocale } from "@/core/i18n";

export function EcosystemBanner() {
  const { t } = useLocale();
  return (
    <Link
      href="/ecosystem"
      className="group flex items-center justify-between gap-4 rounded-2xl border border-teal-600/30 bg-gradient-to-r from-teal-50/80 to-white px-5 py-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-base md:text-lg font-extrabold text-slate-900">{t("svcEcoTitle")}</h2>
          <span className="px-2 py-0.5 rounded-full bg-teal-600/10 text-teal-700 text-xs font-bold">
            {t("svcEcoBadge")}
          </span>
        </div>
        <p className="mt-1 text-xs md:text-sm text-slate-500 truncate">{t("svcEcoBannerDesc")}</p>
      </div>
      <span className="flex-shrink-0 flex items-center gap-1 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-colors">
        {t("svcEcoBannerCta")}
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

EcosystemBanner.displayName = "EcosystemBanner";
