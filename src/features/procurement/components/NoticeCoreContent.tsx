/**
 * 公告详情核心内容区
 * Notice Detail Core Content
 *
 * @module features/procurement/components/NoticeCoreContent
 * @description 主内容区核心块：已解锁时展示 UNSPSC 标签、来源链接与
 *              拓展详情；加载详情时展示骨架屏；锁定时按敏感度分级渐进展示
 *              （次要信息真实预览 → 核心敏感信息数量预告锁卡）。
 *              Core content block: unlocked view (tags, source link and
 *              extended details), skeleton while loading, locked progressive
 *              preview by sensitivity (secondary info → count-teaser lock cards).
 *
 * 安全约束：核心敏感信息（联系人身份/文件清单/报告）服务端从不下发，
 * 锁定态锁卡仅渲染数量预告，DevTools 无法获取任何真实敏感内容。
 */
import { ExternalLink, FileText, ListChecks, Lock, User } from "lucide-react";
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
  /** 锁定态拆解文件计数预览（决定占位文件行数，缺失时取默认值） */
  breakdownFileCount?: number;
}

export function NoticeCoreContent({
  notice,
  coreUnlocked,
  showSkeleton,
  breakdownFileCount,
}: NoticeCoreContentProps) {
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

  // ── 锁定态：按敏感度分级的渐进式展示 ──
  // 次要信息（真实数据，商业敏感度低）：发布日期/投标难度/注册门槛/行业分类，
  // 由预览端点真实下发直接展示；核心敏感信息（联系人身份/文件清单/报告/来源链接）
  // 服务端从不下发，锁定态仅渲染数量预告锁卡。
  const unspscPreview = (notice.unspsc_codes || []).slice(0, 4);
  const secondaryMetrics = [
    { label: t("procurement_publishedDate"), value: notice.published_date || "" },
    { label: t("procurement_bidUrgency"), value: notice.difficulty || "" },
    { label: t("procurement_bidRegBar"), value: notice.registration_level || "" },
  ].filter((metric) => Boolean(metric.value));
  const hasSecondaryPreview = secondaryMetrics.length > 0 || unspscPreview.length > 0;
  const contactCount = Number(notice.contact_count || 0);
  const fileCount = Number(breakdownFileCount || 0);
  const showReportTeaser = notice.is_featured === true;

  return (
    <div className="space-y-4">
      {hasSecondaryPreview && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <h4 className="text-sm font-extrabold text-slate-900">
            {t("procurement_secondaryInfoPreview")}
          </h4>
          {secondaryMetrics.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {secondaryMetrics.map((metric) => (
                <div key={metric.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                  <p className="font-bold text-slate-500">{metric.label}</p>
                  <p dir="auto" className="mt-0.5 font-bold text-slate-800 break-words">{metric.value}</p>
                </div>
              ))}
            </div>
          )}
          {unspscPreview.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {unspscPreview.map((code, index) => (
                <span
                  key={`${code.code || index}`}
                  className="px-2 py-1 rounded-md border border-slate-200 bg-white text-xs font-mono text-slate-600"
                >
                  {code.code || code.name || code.description}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 核心敏感信息锁区：卡片仅含数量预告（无真实身份/文件清单/报告内容），
          服务端从不下发敏感内容，任何前端手段都无法获取超出数量的信息 */}
      <div className="rounded-xl border border-slate-200 p-4 space-y-2">
        <p className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
          <Lock className="w-4 h-4 text-slate-400" />
          {t("procurement_lockedCoreTitle")}
        </p>
        {contactCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
            <User className="w-4 h-4 shrink-0 text-teal-600" />
            {t("procurement_lockedContactsTeaser", { count: contactCount })}
          </div>
        )}
        {fileCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
            <FileText className="w-4 h-4 shrink-0 text-blue-600" />
            {t("procurement_lockedFilesTeaser", { count: fileCount })}
          </div>
        )}
        {showReportTeaser && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
            <ListChecks className="w-4 h-4 shrink-0 text-teal-600" />
            {t("procurement_lockedReportTeaser")}
          </div>
        )}
        <p className="pt-1 text-xs font-bold text-slate-500 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          {t("procurement_unlockToViewFull")}
        </p>
      </div>
    </div>
  );
}
