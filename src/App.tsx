/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App.tsx — 轻量布局入口
 * 业务内容全部委托给 routes.tsx 和各 feature 模块
 */

import { lazy, Suspense } from "react";
import { Toaster } from "sonner";
import { useLocation } from "react-router-dom";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import AppRoutes from "@/routes";
// P0 性能优化：模态组件懒加载——仅在用户触发时才加载对应 chunk
// 回滚：将 lazy(...) 替换回原始 import（见下方注释）
// import { AuthModal } from "@/features/auth";
// import { PaymentModal } from "@/features/payment";
// import { ConsultForm } from "@/shared/forms";
const AuthModal = lazy(() => import("@/features/auth").then(m => ({ default: m.AuthModal })));
const PaymentModal = lazy(() => import("@/features/payment").then(m => ({ default: m.PaymentModal })));
const ConsultForm = lazy(() => import("@/shared/forms").then(m => ({ default: m.ConsultForm })));
const TrainingRegisterForm = lazy(() => import("@/features/training/components/TrainingRegisterForm").then(m => ({ default: m.default })));
import { SessionBanner, AppHeader, AppFooter, useNavTabs, useAppEvents, useAppModals, useVersionCheck, NetworkBanner } from "@/shared/layout";
import { emitAppEvent } from "@/core/events";

export default function App() {
  const { t } = useLocale();
  const { authUser, refreshAuth } = useAuth();
  const {
    showAuthModal, setShowAuthModal, showPaymentModal, setShowPaymentModal,
    paymentPlan, setPaymentPlan, showConsultForm, setShowConsultForm,
    showTrainingRegisterForm, setShowTrainingRegisterForm,
    mobileMenuOpen, setMobileMenuOpen, onRequireLogin, onConsult, onPay, onOpenTrainingRegister,
  } = useAppModals();
  const { tabs, activeTab, switchMainTab } = useNavTabs();
  useAppEvents({ onRequireLogin, onConsult, onPay, onOpenTrainingRegister });
  useVersionCheck();
  // 研修班落地页：main 全宽，由页面内部决定通版/版心
  // （藏青导航条/Hero/CTA 通版，其余区块受 max-w-7xl 版心约束）
  const isTrainingPage = useLocation().pathname === "/training";

  const handlePaymentSuccess = () => {
    if (paymentPlan?.noticeId) emitAppEvent("supply-os:notice-paid", { noticeId: paymentPlan.noticeId });
    setShowPaymentModal(false);
    setPaymentPlan(null);
    // 支付成功后刷新认证状态，更新 isVip 以隐藏套餐卡片
    refreshAuth();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
      <NetworkBanner />
      <AppHeader tabs={tabs} activeTab={activeTab}
        mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen}
        onSwitchTab={switchMainTab} onOpenAuth={() => setShowAuthModal(true)} />
      <main className={isTrainingPage ? "flex-1 w-full" : "flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6"}>
        <SessionBanner />
        <AppRoutes />
      </main>
      {showAuthModal && <Suspense fallback={null}><AuthModal onClose={() => setShowAuthModal(false)} /></Suspense>}
      {showConsultForm && <Suspense fallback={null}><ConsultForm onClose={() => setShowConsultForm(false)} /></Suspense>}
      {showTrainingRegisterForm && (
        <Suspense fallback={null}>
          <TrainingRegisterForm onClose={() => setShowTrainingRegisterForm(false)} />
        </Suspense>
      )}
      {showPaymentModal && paymentPlan && authUser && (
        <Suspense fallback={null}>
          <PaymentModal planCode={paymentPlan.code} planName={paymentPlan.name} amount={paymentPlan.price}
            currency={paymentPlan.currency} noticeId={paymentPlan.noticeId ?? null}
            returnUrl={paymentPlan.returnUrl} orderType={paymentPlan.orderType} originalPlanCode={paymentPlan.originalPlanCode}
            onClose={() => setShowPaymentModal(false)}
            onPaymentSuccess={handlePaymentSuccess} />
        </Suspense>
      )}
      <Toaster richColors position="top-center" closeButton />
      <AppFooter activeTab={activeTab} onSwitchTab={switchMainTab} onOpenConsult={() => setShowConsultForm(true)} />
    </div>
  );
}
