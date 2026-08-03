/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App.tsx — 轻量布局入口
 * 业务内容全部委托给 routes.tsx 和各 feature 模块
 */

import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import AppRoutes from "@/routes";
import { AuthModal } from "@/features/auth";
import { PaymentModal } from "@/features/payment";
import { ConsultForm } from "@/shared/forms";
import { SessionBanner, AppHeader, AppFooter, useNavTabs, useAppEvents, useAppModals, useVersionCheck } from "@/shared/layout";
import { emitAppEvent } from "@/core/events";

export default function App() {
  const { t } = useLocale();
  const { authUser } = useAuth();
  const {
    showAuthModal, setShowAuthModal, showPaymentModal, setShowPaymentModal,
    paymentPlan, setPaymentPlan, showConsultForm, setShowConsultForm,
    mobileMenuOpen, setMobileMenuOpen, onRequireLogin, onConsult, onPay,
  } = useAppModals();
  const { tabs, tabRoutes, activeTab, isTrainingRoute, switchMainTab } = useNavTabs();
  useAppEvents({ onRequireLogin, onConsult, onPay });
  useVersionCheck();

  const handlePaymentSuccess = () => {
    if (paymentPlan?.noticeId) emitAppEvent("supply-os:notice-paid", { noticeId: paymentPlan.noticeId });
    setShowPaymentModal(false);
    setPaymentPlan(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
      <AppHeader tabs={tabs} tabRoutes={tabRoutes} activeTab={activeTab} isTrainingRoute={isTrainingRoute}
        mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen}
        onSwitchTab={switchMainTab} onOpenAuth={() => setShowAuthModal(true)} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
        <SessionBanner />
        <AppRoutes />
      </main>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showConsultForm && <ConsultForm onClose={() => setShowConsultForm(false)} />}
      {showPaymentModal && paymentPlan && authUser && (
        <PaymentModal planCode={paymentPlan.code} planName={paymentPlan.name} amount={paymentPlan.price}
          currency={paymentPlan.currency} userKey={authUser.user_key} noticeId={paymentPlan.noticeId ?? null}
          returnUrl={paymentPlan.returnUrl} onClose={() => setShowPaymentModal(false)}
          onPaymentSuccess={handlePaymentSuccess} />
      )}
      <AppFooter activeTab={activeTab} onSwitchTab={switchMainTab} onOpenConsult={() => setShowConsultForm(true)} />
    </div>
  );
}
