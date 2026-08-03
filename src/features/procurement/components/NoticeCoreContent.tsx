/**
 * 公告详情核心内容区
 * Notice Detail Core Content
 *
 * @module features/procurement/components/NoticeCoreContent
 * @description 主内容区核心块：已解锁时展示 UNSPSC 标签、来源链接与
 *              拓展详情；加载详情时展示骨架屏；锁定时展示三层渐进式预览
 *              （公开分类标签 → VIP 专属预览 → 模糊占位区 + 解锁引导）。
 *              Core content block: unlocked view (tags, source link and
 *              extended details), skeleton while loading, locked progressive
 *              preview (public tags → VIP preview → blurred placeholder).
 *
 * 安全约束：模糊占位区渲染的是固定模板占位内容（不含任何真实数据），
 * 即使通过 DevTools 移除 blur 样式也无法获取敏感信息。
 */
import { Crown, ExternalLink, FileText, ListChecks, Lock, Mail, Phone, User } from "lucide-react";
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
  /** 当前用户是否 VIP（锁定态决定是否渲染 VIP 专属预览层） */
  isVip?: boolean;
  /** 锁定态拆解文件计数预览（决定占位文件行数，缺失时取默认值） */
  breakdownFileCount?: number;
}

export function NoticeCoreContent({
  notice,
  coreUnlocked,
  showSkeleton,
  isVip = false,
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

  // ── 锁定态：三层渐进式预览 ──
  // 第一层公开分类标签（预览端点返回的前 4 个 UNSPSC）；
  // 第二层 VIP 专属预览（机构全称 + 发布日期，预览端点按 VIP 身份下发）；
  // 第三层模糊占位区（固定模板占位内容，不含真实数据）。
  const unspscPreview = (notice.unspsc_codes || []).slice(0, 4);
  const hasVipPreview = isVip && Boolean(notice.agency_full || notice.published_date);
  // 占位文件行数跟随服务端文件计数（2-5 行），缺失时默认 3 行
  const filePlaceholderCount = Math.min(Math.max(breakdownFileCount ?? 3, 2), 5);

  return (
    <div className="space-y-4">
      {unspscPreview.length > 0 && (
        <div>
          <h4 className="text-sm font-extrabold text-slate-900 mb-2">
            {t("procurement_previewPublicInfo")}
          </h4>
          <div className="flex flex-wrap gap-2">
            {unspscPreview.map((code, index) => (
              <span
                key={`${code.code || index}`}
                className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs font-mono text-slate-600"
              >
                {code.code || code.name || code.description}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasVipPreview && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs space-y-1.5">
          <p className="font-black text-amber-800 flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" />
            {t("procurement_vipPreview")}
          </p>
          <p dir="auto" className="text-slate-700 break-words">
            <span className="font-bold text-slate-500">{t("procurement_agencyFullName")}：</span>
            {notice.agency_full || "-"}
          </p>
          <p className="text-slate-700">
            <span className="font-bold text-slate-500">{t("procurement_publishedDate")}：</span>
            {notice.published_date || "-"}
          </p>
        </div>
      )}

      {/* 模糊占位区：固定模板占位内容（aria-hidden 且禁交互/选择），
          移除 blur 样式也只能看到通用占位符，真实数据需解锁后由详情端点提供 */}
      <div className="relative rounded-xl border border-slate-200 overflow-hidden">
        <div className="blur-sm pointer-events-none select-none p-4 space-y-3" aria-hidden="true">
          {/* 联系人占位卡片（模拟 NoticeUnlockedDetails 联系人结构） */}
          <p className="text-xs font-black text-slate-500 uppercase">{t("procurement_contacts")}</p>
          {[1, 2].map((index) => (
            <div
              key={`placeholder-contact-${index}`}
              className="bg-white border border-slate-100 rounded-lg p-3 text-xs text-slate-600 space-y-1"
            >
              <p className="font-bold text-slate-900 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                Contact {index}
              </p>
              <p className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                contact{index}@example.com
              </p>
              <p className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                +00 000 000 00{index}
              </p>
            </div>
          ))}

          {/* 采购文件占位行（行数跟随服务端文件计数） */}
          <p className="text-xs font-black text-slate-500 uppercase pt-1">
            {t("procurement_originalAttachments")}
          </p>
          {Array.from({ length: filePlaceholderCount }).map((_, index) => (
            <div
              key={`placeholder-file-${index}`}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600"
            >
              <span className="flex items-center gap-2 truncate">
                <FileText className="w-4 h-4 shrink-0 text-blue-600" />
                Document_{index + 1}.pdf
              </span>
            </div>
          ))}

          {/* 投标拆解占位（模拟拆解建议结构） */}
          <div className="rounded-lg border border-teal-100 bg-white p-3 text-xs">
            <p className="font-black text-slate-900 mb-2 flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5 text-teal-600" />
              {t("procurement_bidBreakdownTitle")}
            </p>
            <div className="space-y-2">
              <div className="h-3 w-full bg-slate-100 rounded" />
              <div className="h-3 w-11/12 bg-slate-100 rounded" />
              <div className="h-3 w-4/5 bg-slate-100 rounded" />
            </div>
          </div>
        </div>

        {/* 遮罩层：锁图标 + 解锁引导（引导文案为真实可交互内容，不模糊） */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60 backdrop-blur-[2px]">
          <Lock className="w-6 h-6 text-slate-400" />
          <p className="text-sm font-bold text-slate-500">{t("procurement_unlockToViewFull")}</p>
        </div>
      </div>
    </div>
  );
}
