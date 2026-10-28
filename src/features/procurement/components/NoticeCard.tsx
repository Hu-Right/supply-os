/**
 * 公采公告列表行组件（模块02 高密度横向行）
 * Notice List Row — high-density horizontal layout
 *
 * @module features/procurement/components/NoticeCard
 * @description 按「2-全球采购机会库」样图重排：左侧状态标签（公告类型/附件）+ 标题与 Tender ID 主列 +
 *              买家 / 国家 / 金额 / 截止 各列 + 解锁动作。行内不再放描述长文，
 *              一屏 6 条营造库存感（规划 §5.2）；移动端降级为纵向紧凑排布。
 *              Dense horizontal row per design mockup; description lives in the
 *              detail page only. Mobile falls back to stacked compact layout.
 */
import { memo } from "react";
import { Bookmark } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button, Card, Badge, CountryFlag } from "@/shared/ui";
import type { NoticeItem } from "../types";
import { noticeTypeKey } from "@/shared/utils/notice-type";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { formatNoticeAmount, formatNoticeDeadline, formatNoticeReference } from "../utils/noticeDisplay";
// 秒/毫秒归一化 + 日历剩余天数（2026-09-12 收敛）：相对日期标签与
// 绝对截止时间分开计算，避免"明天 + 剩余 2 天"的矛盾组合
import { toUnixMs, calendarDaysLeftCst } from "@/shared/utils/unixTs";

interface NoticeCardProps {
  item: NoticeItem;
  onClick: (item: NoticeItem) => void;
  /** T-B9：曝光采集挂点——父级用 IntersectionObserver 观察行根节点 */
  observe?: (el: HTMLElement | null, noticeId: number) => void;
  /** 是否已收藏（配合 onToggleFavorite 渲染实心态） */
  favorited?: boolean;
  /** 收藏/取消收藏；未提供时隐藏收藏按钮（如首页等无收藏上下文的场景） */
  onToggleFavorite?: (noticeId: number) => void;
}

// P0 性能优化：React.memo 避免父组件 state 变化时列表行全部重渲染
export const NoticeCard = memo(function NoticeCard({ item, onClick, observe, favorited, onToggleFavorite }: NoticeCardProps) {
  const { t, locale } = useLocale();
  // 标题国际化回退链：当前语言缓存 → 英文缓存 → 原文
  const displayTitle = item.titleI18n || item.titleEn || item.title;
  // 已知采购类型走 i18n 本地化，未识别的长尾值原样回退
  const typeKey = noticeTypeKey(item.noticeTypeCode);

  // ── 状态标签组 ──
  const docCount = item.attachments?.length ?? 0;
  // 剩余天数：注册制/框架结束日不是投标截止，不显示倒计时
  const daysLeft = item.deadlineType && item.deadlineType !== "bid" ? null : calendarDaysLeftCst(toUnixMs(item.deadlineTs));
  // 参考编号：与详情页共用同一回退链
  const tenderId = formatNoticeReference(item.reference, item.noticeId);

  const deadlineText = formatNoticeDeadline(
    item.deadlineTs, item.deadlineType, item.deadlineTimezone, locale, t,
  ) || t("procurement_noDeadline");
  const valueText = formatNoticeAmount(item.estimatedValue, item.currencyCode, locale, true);
  const isUnlocked = item.coreLocked === false;

  return (
    <Card
      ref={(el) => observe?.(el, item.noticePk)}
      interactive
      className="p-3 sm:p-4"
      data-testid="notice-card"
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4">
        {/* ── 状态标签列：公告类型 + 附件 ── */}
        <div className="flex lg:flex-col flex-wrap lg:flex-nowrap items-start gap-1 lg:w-28 shrink-0">
          <Badge shape="tag" className="bg-indigo-50 text-indigo-700 border-indigo-100 text-3xs font-bold w-fit whitespace-nowrap">
            {typeKey ? t(typeKey) : item.noticeTypeCode || "Notice"}
          </Badge>
          {docCount > 0 && (
            <Badge variant="info" shape="tag" className="text-3xs font-bold w-fit whitespace-nowrap">
              {t("procurement_hasRawAttachments", { count: docCount })}
            </Badge>
          )}
        </div>

        {/* ── 主列：标题 + Tender ID ── */}
        <div className="flex-1 min-w-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onClick(item)}
            className="w-full justify-start px-0 py-0 h-auto text-left hover:bg-transparent group/title"
          >
            <h4 dir="auto" className="text-sm font-extrabold text-slate-900 line-clamp-1 group-hover/title:text-teal-700 transition-colors">
              {displayTitle}
            </h4>
          </Button>
          <p dir="ltr" className="text-3xs font-mono text-slate-400 mt-1 truncate">
            {tenderId}
          </p>
          {/* 移动端紧凑 meta：桌面端由右侧各列展示 */}
          <div className="md:hidden flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-slate-500">
            {item.countryCode && (
              <>
                <CountryFlag name={item.countryCode} />
                <span>{getCountryDisplayName(item.countryCode, locale)}</span>
              </>
            )}
            <span className="font-bold text-slate-700">{valueText || t("procurement_budgetPending")}</span>
            <span className="font-mono" dir="ltr">{deadlineText}</span>
            {daysLeft !== null && daysLeft >= 0 && (
              <span className="text-rose-600 font-bold">{t("procurement_daysLeft", { days: daysLeft })}</span>
            )}
          </div>
        </div>

        {/* ── 买家列（lg+） ── */}
        <div className="hidden lg:block w-44 shrink-0">
          <p className="text-xs text-slate-700 font-bold truncate">
            {item.agencyI18n || item.buyerName || t("procurement_unknownAgency")}
          </p>
        </div>

        {/* ── 国家列（md+） ── */}
        <div className="hidden md:flex items-center gap-1.5 w-24 shrink-0">
          {item.countryCode && <CountryFlag name={item.countryCode} />}
          <span className="text-xs text-slate-600 truncate">
            {item.countryCode ? getCountryDisplayName(item.countryCode, locale) : ""}
          </span>
        </div>

        {/* ── 金额列（md+，样图紧凑口径） ── */}
        <div className="hidden md:block w-20 shrink-0">
          <span className="text-sm font-black text-slate-800 whitespace-nowrap">
            {valueText || t("procurement_budgetPending")}
          </span>
        </div>

        {/* ─ 截止列（md+）：日期 + 剩余天数 ── */}
        <div className="hidden md:block w-36 shrink-0">
          <p className="text-xs text-slate-600 font-mono text-end whitespace-nowrap" dir="ltr">{deadlineText}</p>
          {daysLeft !== null && daysLeft >= 0 && (
            <p className="text-3xs text-rose-600 font-bold text-end">
              {t("procurement_daysLeft", { days: daysLeft })}
            </p>
          )}
        </div>

        {/* ── 来源列已退役（2026-10-28 用户口径）：来源平台属解锁后可见信息，
             列表卡片一律不展示，详情页解锁后才可见；列表载荷也不再下发该字段 ── */}

        {/* ── 解锁动作 + 收藏：锁定态金色「会员解锁」，解锁态「查看详情」 ─ */}
        <div className="shrink-0 self-start lg:self-center flex items-center gap-2">
          {isUnlocked ? (
            <Button
              onClick={() => onClick(item)}
              variant="secondary"
              size="sm"
              className="px-4 py-2 font-black text-teal-800 whitespace-nowrap"
            >
              {t("procurement_detail")}
            </Button>
          ) : (
            <Button
              onClick={() => onClick(item)}
              size="sm"
              className="px-4 py-2 font-bold text-teal-700 whitespace-nowrap rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 transition-colors"
            >
              {t("procurement_detail")}
            </Button>
          )}
          {/* 收藏按钮（私有书签，未登录由 hook 触发登录） */}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(item.noticePk);
              }}
              className={`p-2 rounded-lg border transition-colors ${
                favorited
                  ? "border-amber-300 bg-amber-50 text-amber-500"
                  : "border-slate-200 text-slate-400 hover:text-amber-500 hover:border-amber-300"
              }`}
              aria-label={t("procurement_bookmark")}
            >
              <Bookmark className={`w-4 h-4 ${favorited ? "fill-amber-500" : ""}`} />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
});






