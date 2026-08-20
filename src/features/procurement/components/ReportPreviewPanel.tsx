/**
 * 中文版订单拆解报告预览面板
 * Chinese Bid Breakdown Report Preview Panel
 *
 * @module features/procurement/components/ReportPreviewPanel
 * @description 未解锁用户看到约 10% 预览内容（按语言环境自适应：zh 优先 description_cn，
 *              非 zh 直接 description）+ 模糊锁定 + 会员升级引导；已解锁用户下载链接
 *              已在 NoticeUnlockedDetails 中提供，本组件直接返回 null。
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
  const { t, locale } = useLocale();
  const { preview, loading, error } = useReportPreview(noticeId, userKey, locale, coreLocked);
  const [collapsed, setCollapsed] = useState(false);

  const downloadHref = preview ? `${reportUrl}?user_key=${encodeURIComponent(userKey)}` : "";
  const isUnlocked = preview?.is_unlocked ?? false;
  const sections = preview?.sections ?? [];
  const totalReportChars = preview?.total_report_chars ?? 0;

  // 预览截断逻辑：每章节最多展示 500 字符，百分比基于完整报告总字符数
  const { visibleSections, shownCharCount } = useMemo(() => {
    if (isUnlocked || sections.length === 0) {
      // 已解锁：完整展示所有章节
      let total = 0;
      for (const s of sections) total += s.heading.length + s.body.length;
      return { visibleSections: sections, shownCharCount: total };
    }
    // 未解锁：每章节最多展示 500 字符
    const MAX_CHARS_PER_SECTION = 500;
    let shown = 0;
    const visible: typeof sections = [];
    for (const s of sections) {
      const bodyLen = s.body.length;
      if (bodyLen <= MAX_CHARS_PER_SECTION) {
        // 内容不足 500 字符，完整展示
        visible.push(s);
        shown += s.heading.length + bodyLen;
      } else {
        // 超过 500 字符，截断并加省略号
        visible.push({ ...s, body: s.body.slice(0, MAX_CHARS_PER_SECTION) + "…" });
        shown += s.heading.length + MAX_CHARS_PER_SECTION + 1;
      }
    }
    return { visibleSections: visible, shownCharCount: shown };
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

          {/* 锁定提示 + 升级引导（预览仅含 2.1 采购描述（中文），无需其余章节模糊占位） */}
          <div className="flex flex-col items-center justify-center bg-gradient-to-t from-teal-50/95 via-teal-50/80 to-teal-50/40 rounded-lg pt-6 pb-4 px-4">
            <Lock className="w-5 h-5 text-slate-400 mb-1" />
            <p className="text-[11px] text-slate-500 mb-2 text-center">
              {t("procurement_previewUnlockHint")}
              {/* P1-15/P2-15 安全修复：预览百分比抽成 i18n key，避免硬编码中文 */}
              {totalReportChars > 0 && " " + t("procurement_previewPercent", { percent: ((shownCharCount / totalReportChars) * 100).toFixed(1) })}
            </p>
            {isVip ? (
              /* P1-14 安全修复：假对象补全 title，避免空标题 */
              <button
                onClick={() => onUnlock({ id: noticeId, title: `#${noticeId}` } as NoticeItem)}
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
  );
}
