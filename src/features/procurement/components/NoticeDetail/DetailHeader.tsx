/**
 * 标题区 + 操作按钮 + 9 列信息速览表
 * @module features/procurement/components/NoticeDetail/DetailHeader
 */
import { ArrowLeft, Bookmark, ExternalLink, Share2 } from "lucide-react";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { getSourcePlatformName } from "@/shared/data/sourcePlatforms";

interface DetailHeaderProps {
  displayTitle: string;
  typeLabel: string;
  noticeType?: string;
  noticeId?: string;
  visibleAgency: string;
  country: string;
  sourceUrl?: string;
  publishDate: string;
  deadlineText: string;
  countdown: { days: number; time: string } | null;
  budgetText: string;
  onBack: () => void;
  /** i18n */
  t: (key: string) => string;
  locale: string;
}

export function DetailHeader({
  displayTitle, typeLabel, noticeType, noticeId, visibleAgency, country,
  sourceUrl, publishDate, deadlineText, countdown, budgetText,
  onBack, t, locale,
}: DetailHeaderProps) {
  const sourceName = getSourcePlatformName(sourceUrl, locale);

  return (
    <>
      {/* ═══ 面包屑 ══ */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-5">
        <button onClick={onBack} className="hover:text-teal-700 transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          {t("detail_breadcrumb")}
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-700 font-medium">{t("detail_breadcrumbDetail")}</span>
      </nav>

      {/* ═══ 标题区 ══ */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
        <div className="min-w-0 flex-1">
          <h3 dir="auto" className="text-2xl md:text-3xl font-extrabold text-slate-950 leading-tight">
            {displayTitle}
          </h3>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold">
              {typeLabel}
            </span>
            {noticeType && (
              <span className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
                {t("detail_medical")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => alert(t("procurement_comingSoon"))}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:border-teal-400 hover:text-teal-700 transition-colors">
            <Bookmark className="w-3.5 h-3.5" />
            {t("detail_collect")}
          </button>
          <button type="button" onClick={() => {
              if (navigator.share) navigator.share({ title: displayTitle, url: window.location.href });
              else { navigator.clipboard.writeText(window.location.href); alert("链接已复制"); }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:border-teal-400 hover:text-teal-700 transition-colors">
            <Share2 className="w-3.5 h-3.5" />
            {t("detail_share")}
          </button>
        </div>
      </div>

      {/* ═══ 9列信息速览表 ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3 mb-6 p-4 rounded-xl bg-slate-50/70 border border-slate-100">
        {[
          [t("detail_noticeId"), sourceUrl
            ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 hover:underline">{noticeId || "-"}<ExternalLink className="w-3 h-3 shrink-0" /></a>
            : noticeId || "-"],
          [t("detail_buyer"), visibleAgency],
          [t("detail_countryRegion"), getCountryDisplayName(country, locale) || t("procurement_global")],
          [t("detail_sourcePlatform"), sourceName || t("detail_sourceOfficial")],
          [t("detail_publishDate"), publishDate],
          [t("detail_deadline"), deadlineText],
          [t("detail_countdown"), countdown
            ? <span className="text-rose-600 font-bold font-mono">{countdown.days}天 {countdown.time}</span>
            : t("procurement_noDeadline")],
          [t("detail_procurementType"), typeLabel],
          [t("detail_budgetAmount"),
            <span className="text-teal-700 font-extrabold">{budgetText}</span>],
        ].map(([label, value]) => (
          <div key={label as string} className="min-w-0">
            <p className="text-2xs font-bold text-slate-400 uppercase mb-1 truncate">{label as string}</p>
            <p className="text-xs font-bold text-slate-800 break-words leading-snug">{value as React.ReactNode}</p>
          </div>
        ))}
      </div>
    </>
  );
}
