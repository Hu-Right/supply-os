/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App.tsx — 轻量布局入口
 * 业务内容全部委托给 routes.tsx 和各 feature 模块
 */

import { useState, useCallback } from "react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import AppRoutes from "@/routes";
import { AuthModal } from "@/features/auth";
import { PaymentModal } from "@/features/payment";
import { ConsultForm } from "@/shared/forms";
import { SessionBanner, AppHeader, AppFooter, useNavTabs, useAppEvents } from "@/shared/layout";

export default function App() {
  const { t } = useLocale();
  const { authUser } = useAuth();

  // UI state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<{ code: string; name: string; price: number; currency: string; noticeId?: number | null; returnUrl?: string } | null>(null);
  const [showConsultForm, setShowConsultForm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 导航
  const { tabs, tabRoutes, activeTab, isTrainingRoute, switchMainTab } = useNavTabs();

  // 全局事件
  const onRequireLogin = useCallback(() => setShowAuthModal(true), []);
  const onConsult = useCallback(() => setShowConsultForm(true), []);
  const onPay = useCallback((detail: typeof paymentPlan) => {
    if (detail) { setPaymentPlan(detail); setShowPaymentModal(true); }
  }, []);
  useAppEvents({ onRequireLogin, onConsult, onPay });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
      <AppHeader
        tabs={tabs}
        tabRoutes={tabRoutes}
        activeTab={activeTab}
        isTrainingRoute={isTrainingRoute}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onSwitchTab={switchMainTab}
        onOpenAuth={() => setShowAuthModal(true)}
      />

      {/* MAIN */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
        <SessionBanner />
        <AppRoutes />
      </main>

      {/* MODALS */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showConsultForm && <ConsultForm onClose={() => setShowConsultForm(false)} />}
      {showPaymentModal && paymentPlan && authUser && (
        <PaymentModal planCode={paymentPlan.code} planName={paymentPlan.name} amount={paymentPlan.price}
          currency={paymentPlan.currency} userKey={authUser.user_key} noticeId={paymentPlan.noticeId ?? null}
          returnUrl={paymentPlan.returnUrl}
          onClose={() => setShowPaymentModal(false)}
          onPaymentSuccess={() => {
            if (paymentPlan.noticeId) {
              window.dispatchEvent(new CustomEvent("supply-os:notice-paid", { detail: { noticeId: paymentPlan.noticeId } }));
            }
            setShowPaymentModal(false);
            setPaymentPlan(null);
          }} />
      )}

      <AppFooter
        activeTab={activeTab}
        onSwitchTab={switchMainTab}
        onOpenConsult={() => setShowConsultForm(true)}
      />
    </div>
  );
}
