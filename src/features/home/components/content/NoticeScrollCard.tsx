/**
 * 首页三栏 — 公告滚动卡（热门商机 / 最新 RFQ 共用体）
 * Home notice scroll card (shared body for Hot notices & RFQ)
 *
 * @module features/home/components/content/NoticeScrollCard
 * @description 从 ContentColumns 内联 renderItem 抽出（2026-10 组件拆分：
 *              单文件 >200 行红线 + 展示组件职责）。两个变体只差徽章与配色：
 *              hot 显示国家旗 + 采购类型徽章（teal），rfq 显示询价徽章（blue）。
 *              宽表字段回退链与列表页 NoticeCard 同口径（shared/utils/noticeDisplay）。
 */
import { CountryFlag } from "@/shared/ui";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { noticeTypeKey } from "@/shared/utils/notice-type";
import { displayNoticeTitle, displayNoticeAgency, displayNoticeBudget, displayDeadlineLabel, type NoticeDisplayFields } from "@/shared/utils/noticeDisplay";

/** 三栏公告卡共用的字段口径（与列表页 NoticeCard 一致；noticePk 为详情链接主键）
 *  数据源就是 /api/notices/unified-search，经 view mapper 后统 camelCase（红线②）。*/
export interface HomeNoticeItem extends NoticeDisplayFields {
  noticePk: number;
  noticeId?: string;
  reference?: string;
}

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** 公告滚动卡：hot（teal 徽章）/ rfq（blue 询价徽章） */
export function NoticeScrollCard({
  notice,
  locale,
  t,
  variant,
}: {
  notice: HomeNoticeItem;
  locale: string;
  t: TFn;
  variant: "hot" | "rfq";
}) {
  const isRfq = variant === "rfq";
  const hover = isRfq ? "group-hover:text-blue-700" : "group-hover:text-teal-700";
  const hoverBtn = isRfq
    ? "group-hover:border-blue-400 group-hover:text-blue-700"
    : "group-hover:border-teal-400 group-hover:text-teal-700";
  // 采购类型徽章文案：noticeTypeKey + i18n，未知类型不展示
  const typeKey = noticeTypeKey(notice.noticeTypeCode);
  const typeLabel = typeKey ? t(typeKey) : "";

  return (
    <a key={notice.noticePk} href={`/procurement?notice_id=${notice.noticePk}`} className="block group py-4">
      <div className="flex items-center gap-2">
        {isRfq ? (
          <span className="px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-2xs font-bold text-blue-700">
            {t("homeRfqBadge")}
          </span>
        ) : (
          <>
            <CountryFlag name={notice.countryCode} />
            {notice.noticeTypeCode && (
              <span className="px-2 py-0.5 rounded border border-teal-200 bg-teal-50 text-2xs font-bold text-teal-700">
                {typeLabel}
              </span>
            )}
          </>
        )}
        <span className={`ml-auto text-xs shrink-0 ${isRfq ? "text-slate-400" : "text-amber-600"}`}>
          {displayDeadlineLabel(notice.deadlineTs)}
        </span>
      </div>
      <p className={`text-[15px] font-extrabold text-slate-900 ${hover} transition-colors line-clamp-2 mt-2`}>
        {displayNoticeTitle(notice)}
      </p>
      <p className="text-xs text-slate-500 mt-1.5 truncate">
        {isRfq
          ? [displayNoticeAgency(notice, locale), getCountryDisplayName(notice.countryCode || "", locale)].filter(Boolean).join(" / ")
          : [getCountryDisplayName(notice.countryCode || "", locale), displayNoticeAgency(notice, locale)].filter(Boolean).join(" / ")}
      </p>
      <div className="flex items-center justify-between mt-2">
        {notice.estimatedValue && notice.estimatedValue !== "0.00" ? (
          <span className="text-sm font-semibold text-slate-800">{t("homeBudgetPrefix")}{displayNoticeBudget(notice.estimatedValue)}</span>
        ) : <span />}
        <span className={`shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 ${hoverBtn} transition-colors`}>
          {t("homeViewDetail")}
        </span>
      </div>
    </a>
  );
}
