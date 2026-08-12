/**
 * 公告详情侧边栏
 * Notice Detail Sidebar
 *
 * @module features/procurement/components/NoticeDetailSidebar
 * @description 详情页右侧操作栏：感兴趣/订阅/解锁按钮、
 *              非VIP用户永久展示会员套餐面板。
 *              Detail page action rail: interest/subscribe/unlock buttons,
 *              membership plan panel permanently shown for non-VIP users.
 */
import { Bell, Heart, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/core/i18n";
import type { NoticeItem, MembershipStatus, MembershipPlan } from "../types";
import type { OrderInfo } from "@/features/payment";
import { NoticePaymentPanel } from "./NoticePaymentPanel";

/** 内嵌多套餐付费面板（付费墙）状态与回调 */
export interface NoticeDetailPaymentState {
  plans: MembershipPlan[];
  paywallNotice: NoticeItem | null;
  order: OrderInfo | null;
  provider: "alipay" | "wechat";
  busyPlanCode: string;
  message: string;
  onProviderChange: (provider: "alipay" | "wechat") => void;
  onCreateOrder: (planCode: string) => void;
  onMockPaid: () => void;
  onClose: () => void;
  /** 加载付费套餐列表（来自 useNoticeMembership） */
  loadPaidPlans?: () => Promise<void>;
}

export interface NoticeDetailSidebarProps {
  notice: NoticeItem;
  membership: MembershipStatus | null;
  freeRemaining: number;
  freeQuota: number;
  canUsePaidQuota: boolean;
  isVip: boolean;
  /** 骨架屏期间隐藏付费解锁按钮，防闪变 */
  showSkeleton: boolean;
  onExpressInterest: (notice: NoticeItem, type: "interested" | "subscribed") => void;
  onUnlock: (notice: NoticeItem) => void;
  onPayUnlock: (notice: NoticeItem) => void;
  payment?: NoticeDetailPaymentState;
}

export function NoticeDetailSidebar({
  notice,
  membership,
  freeRemaining,
  freeQuota,
  canUsePaidQuota,
  isVip,
  showSkeleton,
  onExpressInterest,
  onUnlock,
  onPayUnlock,
  payment,
}: NoticeDetailSidebarProps) {
  const { t } = useLocale();
  const [paywallDismissed, setPaywallDismissed] = useState(false);

  // 切换公告时重置关闭状态，确保新公告重新展示套餐面板
  useEffect(() => {
    setPaywallDismissed(false);
  }, [notice.id]);

  // 非VIP用户进入详情页时自动加载付费套餐列表
  useEffect(() => {
    if (!isVip && payment?.loadPaidPlans) {
      void payment.loadPaidPlans();
    }
  }, [isVip, payment?.loadPaidPlans]);

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
      {/* P0-2 移动端修复：操作按钮固定于视口底部，无需滚动即可触达核心转化操作 */}
      <div className="hidden max-[900px]:fixed max-[900px]:bottom-0 max-[900px]:left-0 max-[900px]:right-0 max-[900px]:z-30 max-[900px]:flex max-[900px]:gap-2 max-[900px]:bg-white/95 max-[900px]:backdrop-blur-md max-[900px]:border-t max-[900px]:border-slate-200 max-[900px]:p-3 max-[900px]:shadow-lg max-[900px]:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {actionButtons}
      </div>

      {/* 桌面端侧边栏：操作按钮 */}
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3 max-[900px]:hidden">
        {actionButtons}
      </div>

      {/* 非VIP用户永久展示会员套餐面板（可通过 X 按钮关闭） */}
      {!isVip && payment && !paywallDismissed && (
        <NoticePaymentPanel
          plans={payment.plans}
          provider={payment.provider}
          order={payment.order}
          busyPlanCode={payment.busyPlanCode}
          message={payment.message}
          onProviderChange={payment.onProviderChange}
          onCreateOrder={payment.onCreateOrder}
          onMockPaid={payment.onMockPaid}
          onClose={() => setPaywallDismissed(true)}
        />
      )}
    </aside>
  );
}
