/**
 * 公采公告列表行组件
 * Notice List Row
 *
 * @module features/procurement/components/NoticeCard
 * @description 列表行布局（单列紧凑行），替代原卡片网格。
 *              两栏结构：左侧主内容（描述 / 机构 / 金额 / UNSPSC）+ 右侧操作按钮，
 *              确保关键信息在首屏完整可见。
 *              List row layout replacing card grid. Two-column structure:
 *              left = main content, right = action button.
 */
// [収藏/dismiss 功能临时禁用 2026-07-30] Star, X 不再使用
// [精选功能重新启用 2026-07-31] Crown 随精选徽标一并恢复
import { memo } from "react";
import { Crown, Target /* , Star, X */ } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import type { LocaleKey } from "@/core/i18n";
import type { NoticeItem } from "../types";
import { noticeTypeKey } from "../notice-type";
import { formatDeadlineZh } from "../utils/formatDeadlineZh";
import { getCountryDisplayName } from "@/shared/data/countryNames";

// T-C3 推荐理由标签（C.3.4）：服务端标签键 → i18n 键白名单映射，未知键静默丢弃
const RECO_REASON_KEYS: Record<string, LocaleKey> = {
  industry_match_l4: "procurement_reason_industry_match_l4",
  industry_match: "procurement_reason_industry_match",
  recent_deadline: "procurement_reason_recent_deadline",
  high_value: "procurement_reason_high_value",
  preferred_region: "procurement_reason_preferred_region",
  // [热门标签临时禁用 2026-07-30]
  // trending: "procurement_reason_trending",
  similar_unlocked: "procurement_reason_similar_unlocked",
};

// 行业精准匹配档次徽章（SSOT 重构后 2 档分色）：
// precise → 绿色（L5/L4 精确匹配），relevant → 蓝色（L3/L2 行业相关）
const MATCH_TIER_CONFIG: Record<string, { key: LocaleKey; color: string }> = {
  precise: { key: "procurement_tier_precise", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  relevant: { key: "procurement_tier_relevant", color: "bg-sky-50 text-sky-700 border-sky-200" },
};

interface NoticeCardProps {
  item: NoticeItem;
  onClick: (item: NoticeItem) => void;
  // [収藏/dismiss 功能临时禁用 2026-07-30]
  // onDismiss?: (item: NoticeItem) => void;
  // onFavorite?: (item: NoticeItem) => void;
  // favorited?: boolean;
  /** T-B9：曝光采集挂点——父级用 IntersectionObserver 观察行根节点 */
  observe?: (el: HTMLElement | null, noticeId: number) => void;
}

// P0 性能优化：React.memo 避免父组件 state 变化时列表行全部重渲染
export const NoticeCard = memo(function NoticeCard({ item, onClick, observe }: NoticeCardProps) {
  const { t, locale } = useLocale();
  // 卡片国际化回退链：
  //   标题：当前语言缓存 → 英文缓存 → 原文
  //   描述：当前语言缓存 → [仅中文环境] 精选中文描述 → 英文缓存 → 原文
  //   description_cn 仅在中文环境下使用，避免非中文用户看到中文内容
  const displayTitle = item.title_i18n || item.title_en || item.title;
  const displayDescription = item.description_i18n
    || (locale === "zh" ? item.description_cn : null)
    || item.description_en
    || item.description;
  // 已知采购类型走 i18n 本地化，未识别的长尾值原样回退
  const typeKey = noticeTypeKey(item.notice_type);
  // 招标内容区域：中文环境优先 description_cn（原生中文字段），回退通用描述链；
  //               非中文环境优先 bid_overview（英文投标概览）
  const bidContent = locale === "zh"
    ? (item.description_cn || item.description_i18n || item.bid_overview || displayDescription)
    : (item.bid_overview || displayDescription);
  // 推荐理由标签：仅推荐/热度兜底响应携带；至多 2 个（服务端已截断，前端再兜底）
  const reasonKeys = (item.reco_reasons || [])
    .map((reason) => RECO_REASON_KEYS[reason])
    .filter((key): key is LocaleKey => Boolean(key))
    .slice(0, 2);

  return (
    <article
      ref={(el) => observe?.(el, item.id)}
      className="border border-slate-200 rounded-xl p-4 bg-white hover:border-teal-300 hover:shadow-sm transition-all"
    >
      {/* ── 顶栏：类型 / 精选 / 匹配档次 / 推荐理由 + 截止日期 ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[11px] font-black">
            {typeKey ? t(typeKey) : item.notice_type || "Notice"}
          </span>
          {/* [精选功能重新启用 2026-07-31] 徽标恢复 */}
          {Boolean(item.is_featured) && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-black">
              <Crown className="w-3 h-3" />
              {t("procurement_featuredBadge")}
            </span>
          )}
          {item.match_tier && MATCH_TIER_CONFIG[item.match_tier] && (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-black ${MATCH_TIER_CONFIG[item.match_tier].color}`}>
              <Target className="w-3 h-3" />
              {t(MATCH_TIER_CONFIG[item.match_tier].key)}
            </span>
          )}
          {reasonKeys.map((key) => (
            <span
              key={key}
              className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100 text-[11px] font-black"
            >
              {t(key)}
            </span>
          ))}
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap">{t("procurement_cardDeadlineLabel")}</span>
          <span className="text-[11px] text-slate-500 font-mono text-end" dir="ltr">
            {locale === "zh"
              ? (formatDeadlineZh(item.deadline, item.deadline_ts) || t("procurement_noDeadline"))
              : (item.deadline || t("procurement_noDeadline"))}
          </span>
        </div>
      </div>

      {/* ── 标题（可点击查看详情） ── */}
      <Button
        type="button"
        variant="ghost"
        onClick={() => onClick(item)}
        className="w-full justify-start px-0 py-0 mt-2 text-left hover:bg-transparent group/title"
      >
        <h4 dir="auto" className="text-sm font-extrabold text-slate-900 line-clamp-2 group-hover/title:text-teal-700 transition-colors">
          {displayTitle}
        </h4>
      </Button>

      {/* ── 两栏：左侧主内容 + 右侧操作按钮 ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mt-2">
        {/* 左栏：描述 / 机构 / 金额 / 受援国 / UNSPSC */}
        <div className="min-w-0 space-y-2">
          <p dir="auto" className="text-xs text-slate-500 line-clamp-2">
            {bidContent || t("procurement_noDesc")}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-slate-700 font-bold truncate max-w-[240px]">
              {item.agency_i18n || item.agency || item.organization || t("procurement_unknownAgency")}
            </span>
            <span className="font-black text-slate-800 whitespace-nowrap">
              {item.estimated_value || t("procurement_budgetPending")}
            </span>
            {item.beneficiary_countries && (
              <span className="text-slate-500 truncate max-w-[160px]">
                {item.beneficiary_countries.split(",").map((s) => s.trim()).filter(Boolean).map((name) => getCountryDisplayName(name, locale)).join(", ")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(item.core_locked === false ? (item.unspsc_codes || []) : []).slice(0, 4).map((code, index) => (
              <span
                key={`${code.code || index}`}
                dir="ltr"
                className="px-1.5 py-0.5 rounded border border-slate-200 text-[11px] font-mono text-slate-600"
              >
                {code.code || code.name || code.description}
              </span>
            ))}
          </div>
        </div>

        {/* 右栏：查看详情按钮 */}
        <div className="flex items-center">
          <Button
            onClick={() => onClick(item)}
            variant="secondary"
            size="sm"
            className="shrink-0 px-4 py-2.5 font-black text-teal-800 whitespace-nowrap"
          >
            {t("procurement_detail")}
          </Button>
        </div>
      </div>
    </article>
  );
});
