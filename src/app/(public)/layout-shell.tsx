"use client";

/**
 * 公开区域布局壳 — 完整功能版
 * Public layout shell — full functionality
 *
 * @description 从 Vite SPA App.tsx 迁移。
 *              包含：导航标签、模态框管理、应用事件、版本检查、
 *              AuthModal / PaymentModal / ConsultForm / TrainingRegisterForm。
 *              所有子组件已通过 next/navigation 适配，无需 shim。
 */

import { lazy, Suspense } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/core/auth";
import { useMembershipTier } from "@/features/membership/hooks/useMembershipTier";
import { emitAppEvent } from "@/core/events";
import {
  SessionBanner,
  AppHeader,
  AppFooter,
  useNavTabs,
  useAppEvents,
  useAppModals,
  useVersionCheck,
  NetworkBanner,
} from "@/shared/layout";

// Client Components — 动态加载（含浏览器 API / 大量交互）
const AuthModal = lazy(() => import("@/features/auth").then((m) => ({ default: m.AuthModal })));
const PaymentModal = lazy(() => import("@/features/payment").then((m) => ({ default: m.PaymentModal })));
const ConsultForm = lazy(() => import("@/shared/forms").then((m) => ({ default: m.ConsultForm })));
const TrainingRegisterForm = lazy(() =>
  import("@/features/training/components/TrainingRegisterForm").then((m) => ({ default: m.default })),
);

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const { authUser, refreshAuth } = useAuth();
  const { tierLabel } = useMembershipTier();
  const {
    showAuthModal,
    setShowAuthModal,
    showPaymentModal,
    setShowPaymentModal,
    paymentPlan,
    setPaymentPlan,
    showConsultForm,
    setShowConsultForm,
    showTrainingRegisterForm,
    setShowTrainingRegisterForm,
    mobileMenuOpen,
    setMobileMenuOpen,
    onRequireLogin,
    onConsult,
    onPay,
    onOpenTrainingRegister,
  } = useAppModals();
  const { tabs, activeTab, switchMainTab } = useNavTabs();
  useAppEvents({ onRequireLogin, onConsult, onPay, onOpenTrainingRegister });
  useVersionCheck();

  // 研修班落地页 + 资质表单：main 全宽
  const pathname = usePathname();
  const isTrainingPage = pathname === "/training" || pathname === "/procurement/qualification";

  const handlePaymentSuccess = () => {
    if (paymentPlan?.noticeId) emitAppEvent("supply-os:notice-paid", { noticeId: paymentPlan.noticeId });
    setShowPaymentModal(false);
    setPaymentPlan(null);
    refreshAuth().catch(() => {
      console.warn("[payment] 支付成功后刷新用户状态失败，用户可能需要手动刷新页面");
    });
  };

  return (
    // flex 纵向 + min-h-screen：内容切换/加载塌缩时页脚钉在视口底部，不再闪现到屏幕中部
    <div className="flex min-h-screen flex-col">
      <NetworkBanner />
      <AppHeader
        tabs={tabs}
        activeTab={activeTab}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onSwitchTab={switchMainTab}
        onOpenAuth={() => setShowAuthModal(true)}
        tierLabel={tierLabel}
      />
      <main className={isTrainingPage ? "flex-1 w-full" : "flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6"}>
        <SessionBanner />
        {children}
      </main>

      {/* Modals */}
      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal onClose={() => setShowAuthModal(false)} />
        </Suspense>
      )}
      {showConsultForm && (
        <Suspense fallback={null}>
          <ConsultForm onClose={() => setShowConsultForm(false)} />
        </Suspense>
      )}
      {showTrainingRegisterForm && (
        <Suspense fallback={null}>
          <TrainingRegisterForm onClose={() => setShowTrainingRegisterForm(false)} />
        </Suspense>
      )}
      {showPaymentModal && paymentPlan && authUser && (
        <Suspense fallback={null}>
          <PaymentModal
            planCode={paymentPlan.code}
            planName={paymentPlan.name}
            amount={paymentPlan.price}
            currency={paymentPlan.currency}
            noticeId={paymentPlan.noticeId ?? null}
            returnUrl={paymentPlan.returnUrl}
            orderType={paymentPlan.orderType}
            originalPlanCode={paymentPlan.originalPlanCode}
            onClose={() => setShowPaymentModal(false)}
            onPaymentSuccess={handlePaymentSuccess}
          />
        </Suspense>
      )}

      <AppFooter
        activeTab={activeTab}
        onSwitchTab={switchMainTab}
        onOpenConsult={() => setShowConsultForm(true)}
      />
    </div>
  );
}
