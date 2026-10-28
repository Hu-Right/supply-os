/**
 * 标题区 + 操作按钮 + 9 列信息速览表
 * @module features/procurement/components/NoticeDetail/DetailHeader
 */
import { ArrowLeft, Bookmark, ExternalLink, Share2 } from "lucide-react";
import { getCountryDisplayName } from "@/shared/data/countryNames";

interface DetailHeaderProps {
  displayTitle: string;
  typeLabel: string;
  noticeId?: string;
  visibleAgency: string;
  country: string;
  sourceUrl?: string;
  /** 来源平台归一信息（/detail 服务端从 platform_aliases 回填） */
  platform?: { canonical: string; code: string | null; zh: string } | null;
  publishDate: string;
  deadlineText: string;
  countdown: { days: number; time: string } | null;
  budgetText: string;
  onBack: () => void;
  /** 当前公告是否已收藏 */
  favorited?: boolean;
  /** 收藏/取消收藏 */
  onToggleFavorite?: () => void;
  /** 点击「分享」：打开应用内分享面板（由父级持有面板状态与公告 id） */
  onShare?: () => void;
  /** i18n（params 供倒计时等插值文案使用） */
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
}

export function DetailHeader({
  displayTitle, typeLabel, noticeId, visibleAgency, country,
  sourceUrl, platform, publishDate, deadlineText, countdown, budgetText,
  onBack, favorited, onToggleFavorite, onShare, t, locale,
}: DetailHeaderProps) {
  // 平台展示名：数据源自表（platform），zh 纯中文名（缺省回退 canonical），与国家展示同口径。
  // platform 为 null（锁定态预览不下发 / 无来源）→ 整个「来源平台」信息位隐藏：
  // 该信息属解锁后可见（2026-10-28 用户口径），锁定详情不露出字段占位。
  const sourceName = platform
    ? (locale !== "zh" ? platform.canonical : (platform.zh || platform.canonical))
    : "";
  const infoRows: Array<[string, React.ReactNode]> = [
    [t("detail_reference"), sourceUrl
      ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="flex min-w-0 max-w-full items-center gap-1 text-teal-600 hover:text-teal-700 hover:underline group/notice-id" title={noticeId || "-"}><span className="min-w-0 truncate">{noticeId || "-"}</span><ExternalLink className="w-3 h-3 shrink-0" /></a>
      : <span className="block min-w-0 truncate" title={noticeId || "-"}>{noticeId || "-"}</span>],
    [t("detail_buyer"), visibleAgency],
    [t("detail_countryRegion"), getCountryDisplayName(country, locale) || t("procurement_global")],
    ...(platform ? [[t("detail_sourcePlatform"), sourceName] as [string, React.ReactNode]] : []),
    [t("detail_publishDate"), publishDate],
    [t("detail_deadline"), deadlineText],
    [t("detail_countdown"), countdown
      ? <span className="text-rose-600 font-bold font-mono">{t("detail_countdownDays", { days: countdown.days })} {countdown.time}</span>
      : t("procurement_noDeadline")],
    [t("detail_procurementType"), typeLabel],
    [t("detail_budgetAmount"),
      <span className="text-teal-700 font-extrabold">{budgetText}</span>],
  ];

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
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onToggleFavorite}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-bold transition-colors ${
              favorited
                ? "border-amber-300 bg-amber-50 text-amber-600"
                : "border-slate-200 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-700"
            }`}>
            <Bookmark className={`w-3.5 h-3.5 ${favorited ? "fill-amber-500 text-amber-500" : ""}`} />
            {favorited ? (t("detail_collected") || "已收藏") : (t("detail_collect") || "收藏")}
          </button>
          <button type="button" onClick={onShare}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:border-teal-400 hover:text-teal-700 transition-colors">
            <Share2 className="w-3.5 h-3.5" />
            {t("detail_share")}
          </button>
        </div>
      </div>

      {/* ═══ 信息速览表（来源平台位仅解锁且确有来源时渲染；列数随之 9/8） ═══ */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${platform ? "lg:grid-cols-9" : "lg:grid-cols-8"} gap-3 mb-6 p-4 rounded-xl bg-slate-50/70 border border-slate-100`}>
        {infoRows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="text-2xs font-bold text-slate-400 uppercase mb-1 truncate">{label}</p>
            <p className="text-xs font-bold text-slate-800 break-words leading-snug">{value}</p>
          </div>
        ))}
      </div>
    </>
  );
}
