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
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { MembershipStatusPanel } from "@/features/membership";
import type { NoticeItem, MembershipStatus } from "../types";

export interface NoticeDetailSidebarProps {
  notice: NoticeItem;
  membership: MembershipStatus | null;
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
  canUsePaidQuota,
  isVip,
  totalRemaining,
  isLoggedIn,
  showSkeleton,
  onExpressInterest,
  onUnlock,
  onPayUnlock,
}: NoticeDetailSidebarProps) {
  const router = useRouter();
  const { t } = useLocale();

  /** 操作按钮组（移动端固定底栏 / 桌面端侧边栏共用） */
  // P3-13 修复：移动端 320px 窄屏下按钮文案溢出——flex-1 均分宽度 + min-w-0 允许
  // truncate 生效 + 文案包裹 truncate span；桌面端保持原样（flex-1 在非 flex 容器无副作用）
  const actionButtons = (
    <>
      <Button
        onClick={() => onExpressInterest(notice, "interested")}
        variant="primary"
        className="w-full max-[900px]:flex-1 max-[900px]:min-w-0 max-[900px]:gap-1.5 max-[900px]:px-2 max-[900px]:text-xs py-2.5 font-black"
      >
        <Heart className="w-4 h-4 shrink-0" />
        <span className="truncate">{t("procurement_interested")}</span>
      </Button>
      <Button
        onClick={() => onExpressInterest(notice, "subscribed")}
        variant="dark"
        className="w-full max-[900px]:flex-1 max-[900px]:min-w-0 max-[900px]:gap-1.5 max-[900px]:px-2 max-[900px]:text-xs font-black"
      >
        <Bell className="w-4 h-4 shrink-0 text-amber-300" />
        <span className="truncate">{t("procurement_subscribeNotice")}</span>
      </Button>
      <Button
        onClick={() => onUnlock(notice)}
        variant="secondary"
        className="w-full max-[900px]:flex-1 max-[900px]:min-w-0 max-[900px]:gap-1.5 max-[900px]:px-2 max-[900px]:text-xs py-2.5 font-black text-teal-800"
      >
        <Lock className="w-4 h-4 shrink-0" />
        <span className="truncate">
          {canUsePaidQuota
            ? t("procurement_memberUnlock")
            : t("procurement_freeUsedUp")}
        </span>
      </Button>
    </>
  );

  return (
    <aside className="sticky top-24 h-fit space-y-4 max-[900px]:static">
      {/* 会员权益状态面板：展示总可用次数与分层明细 */}
      <MembershipStatusPanel
        membership={membership}
        totalRemaining={totalRemaining}
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
        <Button
          onClick={() => router.push(`/membership?notice_id=${notice.id}`)}
          variant="outline"
          className="w-full rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-700 py-3 font-black hover:bg-amber-100"
        >
          <ExternalLink className="w-4 h-4" />
          {t("procurement_viewPlans")}
        </Button>
      )}
    </aside>
  );
}
