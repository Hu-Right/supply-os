/**
 * 公采公告列表行组件（模块02 高密度横向行）
 * Notice List Row — high-density horizontal layout
 *
 * @module features/procurement/components/NoticeCard
 * @description 按「2-全球采购机会库」样图重排：左侧状态标签竖排（NEW/即将截止/
 *              含附件/AI 匹配/精选/推荐理由）+ 标题与 Tender ID · UNSPSC 主列 +
 *              买家 / 国家 / 金额 / 截止 各列 + 解锁动作。行内不再放描述长文，
 *              一屏 6 条营造库存感（规划 §5.2）；移动端降级为纵向紧凑排布。
 *              Dense horizontal row per design mockup; description lives in the
 *              detail page only. Mobile falls back to stacked compact layout.
 */
import { memo } from "react";
import { Crown, Target } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button, Card, Badge, CountryFlag } from "@/shared/ui";
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
  similar_unlocked: "procurement_reason_similar_unlocked",
};

// 行业精准匹配档次徽章（SSOT 重构后 2 档分色）：
// precise → success（L5/L4 精确匹配），relevant → info（L3/L2 行业相关）
const MATCH_TIER_CONFIG: Record<string, { key: LocaleKey; variant: "success" | "info" }> = {
  precise: { key: "procurement_tier_precise", variant: "success" },
  relevant: { key: "procurement_tier_relevant", variant: "info" },
};

/** 金额紧凑格式（样图口径：3.2M / 980K）；无金额返回空串由调用方回退 */
function compactValue(v?: string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n.toLocaleString()}`;
}

interface NoticeCardProps {
  item: NoticeItem;
  onClick: (item: NoticeItem) => void;
  /** T-B9：曝光采集挂点——父级用 IntersectionObserver 观察行根节点 */
  observe?: (el: HTMLElement | null, noticeId: number) => void;
}

// P0 性能优化：React.memo 避免父组件 state 变化时列表行全部重渲染
export const NoticeCard = memo(function NoticeCard({ item, onClick, observe }: NoticeCardProps) {
  const { t, locale } = useLocale();
  // 标题国际化回退链：当前语言缓存 → 英文缓存 → 原文
  const displayTitle = item.title_i18n || item.title_en || item.title;
  // 已知采购类型走 i18n 本地化，未识别的长尾值原样回退
  const typeKey = noticeTypeKey(item.notice_type);

  // ── 状态标签组 ──
  // NEW：主表 create_time 7 天内
  const createdMs = item.create_time ? new Date(item.create_time).getTime() : NaN;
  const isNew = Number.isFinite(createdMs) && Date.now() - createdMs < 7 * 86400000;
  // 即将截止：deadline_ts 兼容秒/毫秒
  const dlMs = typeof item.deadline_ts === "number"
    ? (item.deadline_ts > 1e12 ? item.deadline_ts : item.deadline_ts * 1000)
    : NaN;
  const daysLeft = Number.isFinite(dlMs) && dlMs > 0
    ? Math.ceil((dlMs - Date.now()) / 86400000)
    : null;
  const closingSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;
  const docCount = item.breakdown_file_count ?? 0;
  // Tender ID：reference 优先，回退 notice_id；UNSPSC 首码仅解锁态展示
  const tenderId = item.reference || item.notice_id || "";
  const firstUnspsc = item.core_locked === false
    ? (item.unspsc_codes || []).map((c) => c.code).filter(Boolean)[0]
    : undefined;
  // 推荐理由标签：仅推荐/热度兜底响应携带；至多 2 个
  const reasonKeys = (item.reco_reasons || [])
    .map((reason) => RECO_REASON_KEYS[reason])
    .filter((key): key is LocaleKey => Boolean(key))
    .slice(0, 2);

  const deadlineText = locale === "zh"
    ? (formatDeadlineZh(item.deadline, item.deadline_ts) || t("procurement_noDeadline"))
    : (item.deadline || t("procurement_noDeadline"));
  const valueText = compactValue(item.estimated_value);
  const isUnlocked = item.core_locked === false;

  return (
    <Card
      ref={(el) => observe?.(el, item.id)}
      interactive
      className="p-3 sm:p-4"
      data-testid="notice-card"
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4">
        {/* ── 状态标签列：桌面竖排窄列，移动端横向换行 ── */}
        <div className="flex lg:flex-col flex-wrap lg:flex-nowrap items-start gap-1 lg:w-20 shrink-0">
          <Badge shape="tag" className="bg-indigo-50 text-indigo-700 border-indigo-100 text-3xs font-bold w-fit">
            {typeKey ? t(typeKey) : item.notice_type || "Notice"}
          </Badge>
          {isNew && (
            <Badge variant="success" shape="tag" className="text-3xs font-bold w-fit">NEW</Badge>
          )}
          {closingSoon && (
            <Badge variant="error" shape="tag" className="text-3xs font-bold w-fit">
              {t("procurement_reason_recent_deadline")}
            </Badge>
          )}
          {docCount > 0 && (
            <Badge variant="info" shape="tag" className="text-3xs font-bold w-fit">
              {t("procurement_hasRawAttachments", { count: docCount })}
            </Badge>
          )}
          {Boolean(item.is_featured) && (
            <Badge variant="warning" shape="tag" className="text-3xs font-bold w-fit">
              <Crown className="w-3 h-3" />
              {t("procurement_featuredBadge")}
            </Badge>
          )}
          {item.match_tier && MATCH_TIER_CONFIG[item.match_tier] && (
            <Badge variant={MATCH_TIER_CONFIG[item.match_tier].variant} shape="tag" className="text-3xs font-bold w-fit">
              <Target className="w-3 h-3" />
              {t(MATCH_TIER_CONFIG[item.match_tier].key)}
            </Badge>
          )}
          {reasonKeys.map((key) => (
            <Badge key={key} variant="warning" shape="tag" className="text-3xs font-bold w-fit">
              {t(key)}
            </Badge>
          ))}
        </div>

        {/* ── 主列：标题 + Tender ID · UNSPSC ── */}
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
            {firstUnspsc ? ` · UNSPSC ${firstUnspsc}` : ""}
          </p>
          {/* 移动端紧凑 meta：桌面端由右侧各列展示 */}
          <div className="md:hidden flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-slate-500">
            {item.country && (
              <>
                <CountryFlag name={item.country} />
                <span>{getCountryDisplayName(item.country, locale)}</span>
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
            {item.agency_i18n || item.agency || item.organization || t("procurement_unknownAgency")}
          </p>
        </div>

        {/* ── 国家列（md+） ── */}
        <div className="hidden md:flex items-center gap-1.5 w-24 shrink-0">
          {item.country && <CountryFlag name={item.country} />}
          <span className="text-xs text-slate-600 truncate">
            {item.country ? getCountryDisplayName(item.country, locale) : ""}
          </span>
        </div>

        {/* ── 金额列（md+，样图紧凑口径） ── */}
        <div className="hidden md:block w-20 shrink-0">
          <span className="text-sm font-black text-slate-800 whitespace-nowrap">
            {valueText || t("procurement_budgetPending")}
          </span>
        </div>

        {/* ── 截止列（md+）：日期 + 剩余天数 ── */}
        <div className="hidden md:block w-28 shrink-0">
          <p className="text-xs text-slate-600 font-mono text-end" dir="ltr">{deadlineText}</p>
          {daysLeft !== null && daysLeft >= 0 && (
            <p className="text-3xs text-rose-600 font-bold text-end">
              {t("procurement_daysLeft", { days: daysLeft })}
            </p>
          )}
        </div>

        {/* ── 解锁动作：锁定态金色「会员解锁」，解锁态「查看详情」 ── */}
        <div className="shrink-0 self-start lg:self-center">
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
              className="px-4 py-2 font-black text-white whitespace-nowrap bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600"
            >
              <Crown className="w-3.5 h-3.5 mr-1" />
              {t("procurement_memberUnlock")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
});
