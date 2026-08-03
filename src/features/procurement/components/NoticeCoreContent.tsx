/**
 * 公告详情核心内容区
 * Notice Detail Core Content
 *
 * @module features/procurement/components/NoticeCoreContent
 * @description 主内容区核心块：已解锁时展示 UNSPSC 标签、来源链接与
 *              拓展详情；加载详情时展示骨架屏；锁定时展示解锁引导面板。
 *              Core content block: unlocked view (tags, source link and
 *              extended details), skeleton while loading, locked panel.
 */
import { ExternalLink, Lock } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { NoticeItem } from "../types";
import { NoticeUnlockedDetails } from "./NoticeUnlockedDetails";
import { NoticeDetailSkeleton } from "./NoticeDetailSkeleton";

export interface NoticeCoreContentProps {
  notice: NoticeItem;
  /** 核心信息已解锁 */
  coreUnlocked: boolean;
  /** 拓展详情加载中（展示骨架屏） */
  showSkeleton: boolean;
}

export function NoticeCoreContent({ notice, coreUnlocked, showSkeleton }: NoticeCoreContentProps) {
  const { t } = useLocale();

  if (coreUnlocked) {
    return (
      <>
        <div>
          <h4 className="text-sm font-extrabold text-slate-900 mb-2">{t("procurement_tags")}</h4>
          <div className="flex flex-wrap gap-2">
            {(notice.unspsc_codes || []).slice(0, 16).map((code, index) => (
              <span
                key={`${code.code || index}`}
                className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs font-mono text-slate-600"
              >
                {code.code || code.name || code.description}
              </span>
            ))}
          </div>
        </div>

        {notice.source_url && (
          <a
            href={notice.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline"
          >
            {t("procurement_source")}
            <ExternalLink className="w-4 h-4" />
          </a>
        )}

        <NoticeUnlockedDetails notice={notice} />
      </>
    );
  }

  if (showSkeleton) {
    return <NoticeDetailSkeleton />;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
        <Lock className="w-4 h-4 text-amber-700" />
        {t("procurement_lockedCoreTitle")}
      </h4>
      <p className="text-sm text-amber-900 leading-7 mt-2">{t("procurement_lockedCoreDesc")}</p>
    </div>
  );
}
