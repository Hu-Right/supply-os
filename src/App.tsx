/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App.tsx — 轻量布局入口 (~80 行)
 * 业务内容全部委托给 routes.tsx 和各 feature 模块
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Globe, Building2, Users, Briefcase, BookOpen, Crown,
  LayoutGrid, MessageSquare, Menu
} from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import AppRoutes from "@/routes";
import { AuthModal } from "@/features/auth";
import { PaymentModal } from "@/features/payment";
import { ConsultForm } from "@/shared/forms";
import { LanguageSwitcher, SessionBanner } from "@/shared/layout";
import { preloadRoute } from "@/routes";

export default function App() {
  const { t, localeDir } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const { authUser, isVip } = useAuth();

  // UI state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<{ code: string; name: string; price: number; currency: string; noticeId?: number | null; returnUrl?: string } | null>(null);
  const [showConsultForm, setShowConsultForm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Derive activeTab from URL
  const isTrainingRoute = location.pathname === "/training";
  const activeTab = (() => {
    if (isTrainingRoute) return 0;
    const p = location.pathname;
    if (p === "/showroom" || p === "/") return 1;
    if (p === "/procurement") return 2;
    if (p === "/supplier") return 3;
    if (p === "/crm") return 4;
    if (p === "/services") return 5;
    if (p === "/learning") return 6;
    if (p === "/membership") return 7;
    return 1;
  })();

  const tabRoutes: Record<number, string> = { 1: "/showroom", 2: "/procurement", 3: "/supplier", 4: "/crm", 5: "/services", 6: "/learning", 7: "/membership" };

  const switchMainTab = (tabId: number) => {
    navigate(tabRoutes[tabId] || "/showroom");
  };

  // Global event listeners (see docs 3.5.4 TODO checklist)
  useEffect(() => {
    const onRequireLogin = () => setShowAuthModal(true);
    const onUnauthorized = () => setShowAuthModal(true);
    const onRequireVip = () => setShowAuthModal(true);
    const onOpenAccount = () => setShowAuthModal(true);
    const onConsult = () => setShowConsultForm(true);
    const onPay = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) { setPaymentPlan(detail); setShowPaymentModal(true); }
    };
    window.addEventListener("supply-os:require-login", onRequireLogin);
    window.addEventListener("supply-os:unauthorized", onUnauthorized);
    window.addEventListener("supply-os:require-vip", onRequireVip);
    window.addEventListener("supply-os:open-account", onOpenAccount);
    window.addEventListener("supply-os:consult", onConsult);
    window.addEventListener("supply-os:pay", onPay);
    return () => {
      window.removeEventListener("supply-os:require-login", onRequireLogin);
      window.removeEventListener("supply-os:unauthorized", onUnauthorized);
      window.removeEventListener("supply-os:require-vip", onRequireVip);
      window.removeEventListener("supply-os:open-account", onOpenAccount);
      window.removeEventListener("supply-os:consult", onConsult);
      window.removeEventListener("supply-os:pay", onPay);
    };
  }, []);

  const tabs = [
    { id: 1, label: t("navShowrooms"), icon: Building2 },
    { id: 2, label: t("navJointProcure"), icon: Globe },
    { id: 3, label: t("navSuppliers"), icon: Users },
    { id: 4, label: t("navCRM"), icon: Briefcase, alert: true },
    { id: 5, label: t("navServices"), icon: LayoutGrid },
    { id: 6, label: t("navLearning"), icon: BookOpen },
    { id: 7, label: t("navMembership"), icon: Crown, highlight: true },
  ];

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
            {tabs.slice(0, 6).map((tab) => (
              <button key={tab.id} onClick={() => { switchMainTab(tab.id); setMobileMenuOpen(false); }}
                className={`p-2 rounded-lg ${!isTrainingRoute && activeTab === tab.id ? "bg-teal-50 text-teal-700 font-semibold" : "bg-slate-50"}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* DESKTOP NAV */}
      <nav className="hidden md:block bg-slate-900 text-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div ref={navScrollRef} className="flex gap-1.5 py-2 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => switchMainTab(tab.id)}
                  onMouseEnter={() => preloadRoute(tabRoutes[tab.id] || "/showroom")}
                  className={`flex shrink-0 items-center space-x-2 whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${!isTrainingRoute && activeTab === tab.id ? "bg-teal-600 text-white shadow-md font-semibold" : tab.highlight ? "bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/20" : "hover:bg-slate-800 text-slate-300"}`}>
                  <Icon className={`w-4 h-4 ${tab.highlight && !isTrainingRoute && activeTab !== tab.id ? "text-amber-400 animate-pulse" : ""}`} />
                  <span>{tab.label}</span>
                  {tab.alert && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* MAIN */}
      <main dir={localeDir} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
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

      {/* CONSULT FAB */}
      <div className="md:hidden fixed bottom-18 right-4 z-50">
        <button onClick={() => setShowConsultForm(true)}
          className="w-12 h-12 bg-gradient-to-tr from-teal-600 to-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg">
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <footer className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/80 shadow-lg py-1 flex justify-around">
        {[{ id: 1, label: "展厅", icon: Building2 }, { id: 2, label: "公采", icon: Globe }, { id: 3, label: "供应商", icon: Users }, { id: 4, label: "CRM", icon: Briefcase }, { id: 6, label: "学习", icon: BookOpen }].map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => switchMainTab(tab.id)}
              className={`flex flex-col items-center justify-center w-14 py-1 text-[10px] font-semibold ${activeTab === tab.id ? "text-teal-600 font-bold" : "text-slate-400"}`}>
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{tab.label}</span>
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
