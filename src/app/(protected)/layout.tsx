"use client";

/**
 * (protected)/layout.tsx — 受保护区域布局守卫 + 导航壳
 *
 * 未认证用户重定向到 /showroom 并弹出登录框。
 * requireVip 页面（如 CRM）额外检查 VIP 状态。
 *
 * 与 (public)/layout-shell.tsx 保持一致的导航 UI（AppHeader + AppFooter），
 * 确保从公开页面导航到受保护页面时导航栏不会消失。
 */
import type { ReactNode } from "react";
import { useEffect, Suspense } from "react";
import { useRouter, usePathname } from "next/navigation";
import { lazy } from "react";
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

// 受保护区域也可能需要的模态框（按需懒加载）
const AuthModal = lazy(() => import("@/features/auth").then((m) => ({ default: m.AuthModal })));
const PaymentModal = lazy(() => import("@/features/payment").then((m) => ({ default: m.PaymentModal })));
const ConsultForm = lazy(() => import("@/shared/forms").then((m) => ({ default: m.ConsultForm })));
const TrainingRegisterForm = lazy(() =>
  import("@/features/training/components/TrainingRegisterForm").then((m) => ({ default: m.default })),
);

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { authUser, isVip, authReady, refreshAuth } = useAuth();
  const { tierLabel } = useMembershipTier();
  const router = useRouter();
  const pathname = usePathname();

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

  const needLogin = !authUser;
  const needVip = !needLogin && !isVip;

  useEffect(() => {
    // ★ 认证初始化未完成前不做路由守卫判断，避免 localStorage 恢复期间的误重定向 ★
    if (!authReady) return;
    if (needLogin) {
      emitAppEvent("supply-os:require-login");
      router.replace("/showroom");
    } else if (needVip) {
      emitAppEvent("supply-os:require-vip");
      router.replace("/showroom");
    }
  }, [authReady, needLogin, needVip, router]);

  const handlePaymentSuccess = () => {
    if (paymentPlan?.noticeId) emitAppEvent("supply-os:notice-paid", { noticeId: paymentPlan.noticeId });
    setShowPaymentModal(false);
    setPaymentPlan(null);
    refreshAuth().catch(() => {
      console.warn("[payment] 支付成功后刷新用户状态失败，用户可能需要刷新页面");
    });
  };

  const isTrainingPage = pathname === "/training" || pathname === "/procurement/qualification";

  // 初始化期间显示加载指示（不渲染子组件，避免闪烁）
  if (!authReady) {
    return (
      <>
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
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-teal-500" />
            <p className="text-sm text-slate-400">Loading...</p>
          </div>
        </div>
      </>
    );
  }
  if (needLogin || needVip) return null;

  return (
    <>
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
    </>
  );
}
