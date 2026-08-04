// [収藏/dismiss 功能临时禁用 2026-07-30] Star, X 不再使用
// [精选功能重新启用 2026-07-31] Crown 随精选徽标一并恢复
import { Crown /* , Star, X */ } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { LocaleKey } from "@/core/i18n";
import type { NoticeItem } from "../types";
import { noticeTypeKey } from "../notice-type";
import { formatDeadlineZh } from "../utils/formatDeadlineZh";

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

interface NoticeCardProps {
  item: NoticeItem;
  onClick: (item: NoticeItem) => void;
  // [収藏/dismiss 功能临时禁用 2026-07-30]
  // onDismiss?: (item: NoticeItem) => void;
  // onFavorite?: (item: NoticeItem) => void;
  // favorited?: boolean;
  /** T-B9：曝光采集挂点——父级用 IntersectionObserver 观察卡片根节点 */
  observe?: (el: HTMLElement | null, noticeId: number) => void;
}

export function NoticeCard({ item, onClick, observe }: NoticeCardProps) {
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
  // 推荐理由标签：仅推荐/热度兜底响应携带；至多 2 个（服务端已截断，前端再兜底）
  const reasonKeys = (item.reco_reasons || [])
    .map((reason) => RECO_REASON_KEYS[reason])
    .filter((key): key is LocaleKey => Boolean(key))
    .slice(0, 2);

  return (
    <article
      ref={(el) => observe?.(el, item.id)}
      className="border border-slate-200 rounded-xl p-4 min-h-64 flex flex-col hover:border-teal-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black">
            {typeKey ? t(typeKey) : item.notice_type || "Notice"}
          </span>
          {/* T-A4（本地差异 #14）：精选徽标——三路合格机会判定命中，服务端批量标注 */}
          {/* [精选功能重新启用 2026-07-31] 徽标恢复（服务端 is_featured 标注已同步恢复） */}
          {item.is_featured && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black">
              <Crown className="w-3 h-3" />
              {t("procurement_featuredBadge")}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[9px] text-slate-400 font-bold whitespace-nowrap">{t("procurement_cardDeadlineLabel")}</span>
          <span className="text-[10px] text-slate-500 font-mono text-end" dir="ltr">
            {locale === "zh" ? formatDeadlineZh(item.deadline, item.deadline_ts) : item.deadline}
          </span>
          {/* [収藏/dismiss 功能临时禁用 2026-07-30] Star/X 按钮已移除 */}
        </div>
      </div>
      {reasonKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {reasonKeys.map((key) => (
            <span
              key={key}
              className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-black"
            >
              {t(key)}
            </span>
          ))}
        </div>
      )}
      <h4 dir="auto" className="text-base font-extrabold text-slate-900 mt-3 line-clamp-2">{displayTitle}</h4>
      <p dir="auto" className="text-xs text-slate-500 mt-3 line-clamp-3">{displayDescription || t("procurement_noDesc")}</p>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {(item.core_locked === false ? (item.unspsc_codes || []) : []).slice(0, 4).map((code, index) => (
          <span
            key={`${code.code || index}`}
            dir="ltr"
            className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-mono text-slate-600"
          >
            {code.code || code.name || code.description}
          </span>
        ))}
      </div>
      <div className="mt-auto pt-4 border-t border-slate-100 flex items-end justify-between gap-3">
        <div className="text-xs min-w-0">
          <p className="font-black text-slate-800">{item.estimated_value || t("procurement_budgetPending")}</p>
          <p className="text-slate-500 truncate">
            {item.agency || item.organization || t("procurement_unknownAgency")}
          </p>
        </div>
        <button
          onClick={() => onClick(item)}
          className="px-3 py-2 rounded-lg bg-teal-100 text-teal-800 text-xs font-black hover:bg-teal-200"
        >
          {t("procurement_detail")}
        </button>
      </div>
    </article>
  );
}
