/**
 * 采购页"我的收藏"快捷区
 * Favorite notices quick strip on the procurement page
 *
 * @module features/procurement/components/FavoriteNotices
 * @description 展示当前用户最近收藏的 5 条公告（按收藏时间倒序），提供"打开"跳转。
 *              随收藏集合变化即时刷新（卡片/详情页取消收藏后此区同步消失）；
 *              非中文界面优先渲染标题译文。无收藏或加载失败时静默不渲染，不阻断采购列表。
 */
import { ArrowRight, Bookmark } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { useFavoriteNotices } from "../hooks/useFavoriteNotices";

export interface FavoriteNoticesProps {
  /** 已收藏 id 集合：内容变化（收藏/取消）即触发刷新 */
  favoriteIds: Set<number>;
  onOpenNotice: (noticeId: number) => void;
}

export function FavoriteNotices({ favoriteIds, onOpenNotice }: FavoriteNoticesProps) {
  const { t, locale } = useLocale();
  const { items } = useFavoriteNotices(favoriteIds, locale);

  if (items.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-100 bg-gradient-to-r from-amber-50/60 to-white p-4">
      <p className="text-xs font-black text-slate-500 uppercase flex items-center gap-1.5 tracking-wide mb-3">
        <Bookmark className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
        {t("procurement_myFavorites") || "我的收藏"}
      </p>
      <ul className="space-y-2">
        {items.map((item) => {
          const title = item.title_i18n || item.title || `#${item.id}`;
          return (
            <li
              key={item.id}
              className="group flex items-center justify-between gap-3 rounded-lg bg-white border border-slate-100 px-3.5 py-2.5 shadow-sm hover:border-amber-200 hover:shadow-md transition-all duration-200"
            >
              <span dir="auto" className="text-sm font-semibold text-slate-700 truncate min-w-0 flex-1">
                {title}
              </span>
              <Button
                onClick={() => onOpenNotice(item.id)}
                variant="link"
                size="sm"
                className="gap-1 px-0 text-teal-600 font-semibold hover:text-teal-800 cursor-pointer opacity-70 group-hover:opacity-100 transition-opacity shrink-0"
              >
                {t("myPurchasesOpenDetail")}
                <ArrowRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

FavoriteNotices.displayName = "FavoriteNotices";
