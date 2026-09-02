/**
 * 中文拆解报告不可用时的微信客服引导横幅
 * WeChat customer-service guidance banner when Chinese breakdown report is unavailable
 *
 * @module features/procurement/components/ReportUnavailableBanner
 * @description 当公告无法提供中文版拆解报告时，引导用户通过微信客服渠道获得人工定向处理服务。
 *              按用户类型（VIP / 普通已登录 / 未登录）差异化展示文案，
 *              通过 sessionStorage 实现同会话按 notice_id 粒度去重，避免频繁打扰。
 *              Shows a guidance banner directing users to WeChat customer service
 *              when a Chinese breakdown report is unavailable. Differentiates copy
 *              by user type (VIP / logged-in / guest). Dismissed banners are
 *              remembered per session via sessionStorage (per notice_id).
 */

import { useState, useCallback } from "react";
import { Crown, MessageCircle, X, FileX } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { WechatQRModal } from "@/shared/ui";

// ── sessionStorage 去重工具 ──
const DISMISSED_KEY = "report_unavailable_dismissed";
const MAX_DISMISSED = 50;

function isDismissed(noticeId: number): boolean {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    const ids: number[] = raw ? JSON.parse(raw) : [];
    return ids.includes(noticeId);
  } catch {
    return false;
  }
}

function markDismissed(noticeId: number): void {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    const ids: number[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(noticeId)) {
      ids.push(noticeId);
      if (ids.length > MAX_DISMISSED) ids.splice(0, ids.length - MAX_DISMISSED);
      sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
    }
  } catch {
    /* 隐私模式可能拒绝写入，静默忽略 */
  }
}

// ── 组件接口 ──
interface ReportUnavailableBannerProps {
  /** 公告 ID（去重粒度） */
  noticeId: number;
  /** 是否 VIP 用户 */
  isVip: boolean;
  /** 是否已登录 */
  isLoggedIn: boolean;
}

export function ReportUnavailableBanner({
  noticeId,
  isVip,
  isLoggedIn,
}: ReportUnavailableBannerProps) {
  const { t } = useLocale();
  const [dismissed, setDismissed] = useState(() => isDismissed(noticeId));
  const [showQr, setShowQr] = useState(false);

  const handleDismiss = useCallback(() => {
    markDismissed(noticeId);
    setDismissed(true);
  }, [noticeId]);

  // 已关闭则不渲染
  if (dismissed) return null;

  // 差异化文案
  const guideText = isVip
    ? t("procurement_reportGuideVip")
    : isLoggedIn
      ? t("procurement_reportGuideUser")
      : t("procurement_reportGuideGuest");

  return (
    <>
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
        {/* 标题行 */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-extrabold text-amber-900 flex items-center gap-2">
            <FileX className="w-4 h-4 shrink-0 text-amber-600" />
            {t("procurement_reportUnavailable")}
            {isVip && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-amber-300 bg-amber-100 text-2xs font-black text-amber-700">
                <Crown className="w-3 h-3" />
                VIP
              </span>
            )}
          </p>
          <Button
            onClick={handleDismiss}
            variant="ghost"
            size="iconSm"
            className="shrink-0 rounded-md text-amber-400 hover:text-amber-700 hover:bg-amber-100"
            aria-label={t("procurement_dismiss")}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* 引导文案 */}
        <p className="text-xs text-amber-800 leading-5">{guideText}</p>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowQr(true)}
            variant="accent"
            size="sm"
            className="gap-1.5 font-black"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {t("procurement_contactWechatService")}
          </Button>
        </div>
      </div>

      {/* 微信二维码 Modal（复用共享组件） */}
      {showQr && <WechatQRModal onClose={() => setShowQr(false)} />}
    </>
  );
}
