/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App.tsx — 应用外壳：布局（头部 / 导航 / 底栏） + 全局 Modal 编排
 * （认证 / 支付 / 咨询）与全局事件订阅；业务内容全部委托给 routes.tsx 和各 feature 模块
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Globe, Crown, MessageSquare, Menu } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { onAppEvent, emitAppEvent, type PayEventDetail } from "@/core/events";
import AppRoutes from "@/routes";
import { AuthModal } from "@/features/auth";
import { PaymentModal } from "@/features/payment";
import { ConsultForm } from "@/shared/forms";
import { LanguageSwitcher, SessionBanner, NAV_TABS } from "@/shared/layout";
import { preloadRoute } from "@/routes";

export default function App() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const { authUser, isVip } = useAuth();

  // UI state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<PayEventDetail | null>(null);
  const [showConsultForm, setShowConsultForm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 依据 URL 高亮当前 tab（根路径视作 showroom；training 页不高亮任何 tab）
  const isTrainingRoute = location.pathname === "/training";
  const activePath = location.pathname === "/" ? "/showroom" : location.pathname;

  // Global event listeners (see docs 3.5.4 TODO checklist)
  useEffect(() => {
    const offs = [
      onAppEvent("supply-os:require-login", () => setShowAuthModal(true)),
      onAppEvent("supply-os:unauthorized", () => setShowAuthModal(true)),
      onAppEvent("supply-os:require-vip", () => setShowAuthModal(true)),
      onAppEvent("supply-os:open-account", () => setShowAuthModal(true)),
      onAppEvent("supply-os:consult", () => setShowConsultForm(true)),
      onAppEvent("supply-os:pay", (detail) => {
        if (detail) {
          setPaymentPlan(detail);
          setShowPaymentModal(true);
        }
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // 桌面导航横向滚动容器 + 滚轮纵向→横向转换
  const navScrollRef = useRef<HTMLDivElement>(null);

  // 鼠标在导航栏上时：阻止页面纵向滚动，将滚轮量转为横向滚动。
  // 必须用原生 addEventListener({ passive: false }) 才能可靠调用 preventDefault。
  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 border-b border-slate-200/80 shadow-xs backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-indigo-600 flex items-center justify-center text-white font-extrabold shadow-sm">
              <Globe className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight bg-gradient-to-r from-teal-700 to-slate-900 bg-clip-text text-transparent">{t("brandName")}</h1>
              <div className="text-xs text-slate-400 font-mono hidden md:block">
                SYS: ACTIVE | UTC: 2026-05-30
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={() => setShowAuthModal(true)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${isVip ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"}`}>
              <Crown className="w-3.5 h-3.5" />
              <span>{authUser ? `${authUser.display_name || authUser.email} · ${isVip ? t("vipLabel") : t("freeLabel")}` : t("guestLevel")}</span>
            </button>
            <LanguageSwitcher />
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100">
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE MENU */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 z-30 shadow-md">
          <div className="grid grid-cols-2 gap-2 text-center">
            {NAV_TABS.slice(0, 6).map((tab) => (
              <button key={tab.path} onClick={() => { navigate(tab.path); setMobileMenuOpen(false); }}
                className={`p-2 rounded-lg ${!isTrainingRoute && activePath === tab.path ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}>
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* DESKTOP NAV */}
      <nav className="hidden md:block bg-slate-900 text-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div ref={navScrollRef} className="flex gap-1.5 py-2 overflow-x-auto scrollbar-none">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.path} onClick={() => navigate(tab.path)}
                  onMouseEnter={() => preloadRoute(tab.path)}
                  className={`flex shrink-0 items-center space-x-2 whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${!isTrainingRoute && activePath === tab.path ? "bg-teal-600 text-white shadow-md font-semibold" : tab.highlight ? "bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/20" : "hover:bg-slate-800 text-slate-300"}`}>
                  <Icon className={`w-4 h-4 ${tab.highlight && !isTrainingRoute && activePath !== tab.path ? "text-amber-400 animate-pulse" : ""}`} />
                  <span>{t(tab.labelKey)}</span>
                  {tab.alert && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* MAIN */}
      {/* 方向由 LocaleContext 设置的 html.dir 全局接管（全页真 RTL），不再局部覆盖 */}
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
              emitAppEvent("supply-os:notice-paid", { noticeId: paymentPlan.noticeId });
            }
            setShowPaymentModal(false);
            setPaymentPlan(null);
          }} />
      )}

      {/* CONSULT FAB */}
      <div className="md:hidden fixed bottom-18 end-4 z-50">
        <button onClick={() => setShowConsultForm(true)}
          className="w-12 h-12 bg-gradient-to-tr from-teal-600 to-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg">
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <footer className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/80 shadow-lg py-1 flex justify-around">
        {NAV_TABS.filter((tab) => tab.mobile).map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.path} onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center w-14 py-1 text-[10px] font-semibold ${activePath === tab.path ? "text-teal-600 font-bold" : "text-slate-400"}`}>
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{t(tab.shortLabelKey ?? tab.labelKey)}</span>
            </button>
          );
        })}
      </footer>

      {/* DESKTOP FOOTER */}
      <footer className="hidden md:block bg-slate-100 border-t border-slate-200 py-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
          <p>{t("footerCopyright")}</p>
          <div className="flex space-x-4">
            <span className="hover:underline cursor-pointer">{t("footerTerms")}</span>
            <span className="hover:underline cursor-pointer">{t("footerPrivacy")}</span>
            <span className="hover:underline cursor-pointer">{t("footerUnspsc")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
