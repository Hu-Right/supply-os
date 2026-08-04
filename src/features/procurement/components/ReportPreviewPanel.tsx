/**
 * 中文版订单拆解报告预览面板
 * Chinese Bid Breakdown Report Preview Panel
 *
 * @module features/procurement/components/ReportPreviewPanel
 * @description 未解锁用户看到约 10% 预览内容 + 模糊锁定 + 会员升级引导；
 *              已解锁用户下载链接已在 NoticeUnlockedDetails 中提供，本组件直接返回 null。
 */
import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, FileText, Lock, Crown, Unlock } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useReportPreview } from "../hooks/useReportPreview";
import type { NoticeItem } from "@/types/procurement";

interface ReportPreviewPanelProps {
  noticeId: number;
  userKey: string;
  reportUrl: string;
  isVip: boolean;
  onUnlock: (notice: NoticeItem) => void;
  /** 公告锁定状态，解锁后变化触发预览数据重新请求 */
  coreLocked?: boolean;
}

export function ReportPreviewPanel({ noticeId, userKey, reportUrl, isVip, onUnlock, coreLocked }: ReportPreviewPanelProps) {
  const { t } = useLocale();
  const { preview, loading, error } = useReportPreview(noticeId, userKey, coreLocked);
  const [collapsed, setCollapsed] = useState(false);

  const downloadHref = preview ? `${reportUrl}?user_key=${encodeURIComponent(userKey)}` : "";
  const isUnlocked = preview?.is_unlocked ?? false;
  const sections = preview?.sections ?? [];

  // 计算 10% 预览截止点（按字符数）
  const { visibleSections, hiddenCharCount, totalCharCount } = useMemo(() => {
    if (isUnlocked || sections.length === 0) {
      return { visibleSections: sections, hiddenCharCount: 0, totalCharCount: 0 };
    }
    let totalChars = 0;
    for (const s of sections) totalChars += s.heading.length + s.body.length;
    const threshold = Math.max(200, Math.floor(totalChars * 0.1));
    let accumulated = 0;
    const visible: typeof sections = [];
    for (const s of sections) {
      const sectionChars = s.heading.length + s.body.length;
      if (accumulated + sectionChars <= threshold) {
        visible.push(s);
        accumulated += sectionChars;
      } else {
        // 当前章节部分展示：截取到阈值
        const remaining = threshold - accumulated;
        if (remaining > 20) {
          visible.push({ ...s, body: s.body.slice(0, remaining) + "…" });
          accumulated += remaining; // 加上部分展示的字符数
        }
        break;
      }
    }
    return { visibleSections: visible, hiddenCharCount: totalChars - accumulated, totalCharCount: totalChars };
  }, [sections, isUnlocked]);

  // 加载态：骨架屏
  if (loading) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-3 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-teal-200" />
          <div className="h-4 w-32 rounded bg-teal-200" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-slate-200" />
          <div className="h-3 w-4/5 rounded bg-slate-200" />
          <div className="h-3 w-3/5 rounded bg-slate-200" />
        </div>
      </div>
    );
  }

  // 失败态或无报告数据：静默不渲染
  if (error || !preview || sections.length === 0) return null;

  // 已解锁：下载链接已在 NoticeUnlockedDetails 中提供，无需预览卡片
  if (isUnlocked) return null;

  // 未解锁：预览模式（10% 内容 + 模糊锁定 + 升级引导）
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 overflow-hidden">
      {/* 标题栏 */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-teal-50 transition-colors"
      >
        <p className="text-sm font-extrabold text-teal-800 flex items-center gap-2">
          <FileText className="w-4 h-4 shrink-0 text-teal-600" />
          {t("procurement_reportPreviewTitle")}
          <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
            {t("procurement_previewPartial")}
          </span>
        </p>
        {collapsed ? <ChevronDown className="w-4 h-4 text-teal-500 shrink-0" /> : <ChevronUp className="w-4 h-4 text-teal-500 shrink-0" />}
      </button>

      {/* 展开/收缩内容：grid-rows 过渡动画 */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        }`}
      >
        <div className="overflow-hidden">
        <div className="px-4 pb-4 space-y-3">
          {/* 章节内容 */}
          {visibleSections.map((section, idx) => (
            <div key={idx}>
              <p className="text-xs font-black text-teal-700 mb-1">{section.heading}</p>
              <p className="text-xs text-slate-700 leading-5 whitespace-pre-line break-words bg-white border border-teal-100 rounded-lg p-3">
                {section.body}
              </p>
            </div>
          ))}

          {/* 模糊锁定剩余内容 + 升级引导 */}
          <div className="relative">
            <div className="blur-sm select-none pointer-events-none max-h-20 overflow-hidden space-y-3">
              {sections.slice(visibleSections.length, visibleSections.length + 2).map((section, idx) => (
                <div key={idx}>
                  <p className="text-xs font-black text-teal-700 mb-1">{section.heading}</p>
                  <div className="h-16 w-full rounded-lg bg-slate-100" />
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-teal-50/95 via-teal-50/80 to-transparent pt-8 px-4">
              <Lock className="w-5 h-5 text-slate-400 mb-1" />
              <p className="text-[11px] text-slate-500 mb-2 text-center">
                {t("procurement_previewUnlockHint")}
                {totalCharCount > 0 && `（已展示 ${(((totalCharCount - hiddenCharCount) / totalCharCount) * 100).toFixed(1)}%）`}
              </p>
              {isVip ? (
                <button
                  onClick={() => onUnlock({ id: noticeId } as NoticeItem)}
                  className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2 rounded-lg bg-teal-600 text-white text-xs sm:text-sm font-black hover:bg-teal-700 transition-colors shadow-sm whitespace-nowrap min-w-0 max-w-full"
                >
                  <Unlock className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t("procurement_previewUnlockNow")}</span>
                </button>
              ) : (
                <a
                  href="/membership"
                  className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs sm:text-sm font-black hover:from-amber-600 hover:to-orange-600 transition-colors shadow-sm whitespace-nowrap min-w-0 max-w-full"
                >
                  <Crown className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t("procurement_previewUpgrade")}</span>
                </a>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
