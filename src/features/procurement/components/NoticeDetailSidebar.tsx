/**
 * 公告详情侧边栏
 * Notice Detail Sidebar
 *
 * @module features/procurement/components/NoticeDetailSidebar
 * @description 详情页右侧操作栏：感兴趣/订阅/解锁按钮、
 *              非VIP用户显示"查看套餐"按钮跳转到独立套餐页面。
 *              Detail page action rail: interest/subscribe/unlock buttons,
 *              non-VIP users see "View Plans" button to navigate to plans page.
 */
import { Bell, Heart, Lock, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "@/core/i18n";
import { MembershipStatusPanel } from "@/features/membership/components/MembershipStatusPanel";
import type { NoticeItem, MembershipStatus } from "../types";

export interface NoticeDetailSidebarProps {
  notice: NoticeItem;
  membership: MembershipStatus | null;
  freeRemaining: number;
  freeQuota: number;
  canUsePaidQuota: boolean;
  isVip: boolean;
  /** 总可用解锁次数 */
  totalRemaining: number;
  /** 是否已登录 */
  isLoggedIn: boolean;
  /** 骨架屏期间隐藏付费解锁按钮，防闪变 */
  showSkeleton: boolean;
  onExpressInterest: (notice: NoticeItem, type: "interested" | "subscribed") => void;
  onUnlock: (notice: NoticeItem) => void;
  onPayUnlock: (notice: NoticeItem) => void;
}

export function NoticeDetailSidebar({
  notice,
  membership,
  freeRemaining,
  freeQuota,
  canUsePaidQuota,
  isVip,
  totalRemaining,
  isLoggedIn,
  showSkeleton,
  onExpressInterest,
  onUnlock,
  onPayUnlock,
}: NoticeDetailSidebarProps) {
  const navigate = useNavigate();
  const { t } = useLocale();

  /** 操作按钮组（移动端固定底栏 / 桌面端侧边栏共用） */
  const actionButtons = (
    <>
      <button
        onClick={() => onExpressInterest(notice, "interested")}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-black hover:bg-blue-700"
      >
        <Heart className="w-4 h-4" />
        {t("procurement_interested")}
      </button>
      <button
        onClick={() => onExpressInterest(notice, "subscribed")}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-black hover:bg-slate-800"
      >
        <Bell className="w-4 h-4 text-amber-300" />
        {t("procurement_subscribeNotice")}
      </button>
      <button
        onClick={() => onUnlock(notice)}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-100 text-teal-800 text-sm font-black hover:bg-teal-200"
      >
        <Lock className="w-4 h-4" />
        {canUsePaidQuota
          ? t("procurement_memberUnlock")
          : freeRemaining > 0
            ? `${t("procurement_freeUnlock")} (${t("procurement_remaining")} ${freeRemaining})`
            : t("procurement_freeUsedUp")}
      </button>
    </>
  );

  return (
    <aside className="sticky top-24 h-fit space-y-4 max-[900px]:static">
      {/* 会员权益状态面板：展示总可用次数与分层明细 */}
      <MembershipStatusPanel
        membership={membership}
        totalRemaining={totalRemaining}
        freeQuota={freeQuota}
        freeRemaining={freeRemaining}
        isLoggedIn={isLoggedIn}
        noticeId={notice.id}
        compact
      />

      {/* P0-2 移动端修复：操作按钮固定于视口底部，无需滚动即可触达核心转化操作 */}
      <div className="hidden max-[900px]:fixed max-[900px]:bottom-0 max-[900px]:left-0 max-[900px]:right-0 max-[900px]:z-30 max-[900px]:flex max-[900px]:gap-2 max-[900px]:bg-white/95 max-[900px]:backdrop-blur-md max-[900px]:border-t max-[900px]:border-slate-200 max-[900px]:p-3 max-[900px]:shadow-lg max-[900px]:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {actionButtons}
      </div>

      {/* 桌面端侧边栏：操作按钮 */}
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3 max-[900px]:hidden">
        {actionButtons}
      </div>

      {/* 非VIP用户显示"查看套餐"按钮，跳转到会员套餐详情页面 */}
      {!isVip && (
        <button
          onClick={() => navigate(`/membership?notice_id=${notice.id}`)}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-700 text-sm font-black hover:bg-amber-100 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          {t("procurement_viewPlans")}
        </button>
      )}
    </aside>
  );
}
