/**
 * 公告详情侧边栏
 * Notice Detail Sidebar
 *
 * @module features/procurement/components/NoticeDetailSidebar
 * @description 详情页右侧操作栏：感兴趣/订阅/解锁/付费按钮、配额信息、
 *              付费服务说明与内嵌多套餐付费面板（付费墙）。
 *              Detail page action rail: interest/subscribe/unlock/pay buttons,
 *              quota info, paid service notes and the embedded paywall panel.
 */
import { Bell, Crown, Heart, Lock, WalletCards } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { NoticeItem, MembershipStatus, MembershipPlan } from "../types";
import type { OrderInfo } from "@/features/payment";
import { NoticePaymentPanel } from "./NoticePaymentPanel";

/** 内嵌多套餐付费面板（付费墙）状态与回调；paywallNotice 存在时渲染面板 */
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
  return (
    <aside className="sticky top-24 h-fit space-y-4 max-[900px]:static">
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
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

        {notice.core_locked !== false && !showSkeleton && !isVip && freeRemaining <= 0 && (
          <button
            onClick={() => onPayUnlock(notice)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-black hover:bg-teal-700"
          >
            <WalletCards className="w-4 h-4" />
            {t("procurement_singleUnlock")}
          </button>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 space-y-2">
          <p className="font-black text-slate-800 flex items-center gap-2">
            <WalletCards className="w-4 h-4 text-teal-600" />
            {t("procurement_quotaTitle")}
          </p>
          <p>
            {t("procurement_freeQuota")}: {t("procurement_used")} {membership?.free_used ?? 0}/{freeQuota},{" "}
            {t("procurement_remaining")} {freeRemaining}
          </p>
          <p>
            {t("procurement_paidQuota")}: {t("procurement_used")} {membership?.paid_quota_used ?? 0}/
            {membership?.paid_quota_total ?? 0}, {t("procurement_remaining")}{" "}
            {membership?.paid_quota_remaining ?? 0}
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
          <p className="font-black text-slate-900 flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-600" />
            {t("procurement_paidServiceTitle")}
          </p>
          <ul className="space-y-1 leading-5 list-disc ps-4">
            <li>{t("procurement_paidServiceContact")}</li>
            <li>{t("procurement_paidServiceAnalysis")}</li>
            <li>{t("procurement_paidServiceProcess")}</li>
          </ul>
          <p className="text-[11px] text-amber-800">{t("procurement_paidServiceManualNote")}</p>
        </div>

        <p className="text-[11px] leading-5 text-slate-500">{t("procurement_actionTip", { count: freeQuota })}</p>
      </div>

      {payment?.paywallNotice && (
        <NoticePaymentPanel
          plans={payment.plans}
          provider={payment.provider}
          order={payment.order}
          busyPlanCode={payment.busyPlanCode}
          message={payment.message}
          onProviderChange={payment.onProviderChange}
          onCreateOrder={payment.onCreateOrder}
          onMockPaid={payment.onMockPaid}
          onClose={payment.onClose}
        />
      )}
    </aside>
  );
}
