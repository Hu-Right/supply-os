"use client";

/**
 * (protected)/layout.tsx — 受保护区域布局守卫 + 导航壳
 *
 * - 未认证：重定向 /showroom 并弹出登录框（localStorage 恢复窗口期显示 spinner，不误弹）
 * - 已登录非 VIP：不再重定向 —— 原地渲染 VIP 门槛面板（保留 /crm URL 与导航壳，
 *   用户清楚看到"需升级"而非被无声弹回首页），一键跳转 /membership 开通
 *
 * 与 (public)/layout-shell.tsx 保持一致的导航 UI（AppHeader + AppFooter），
 * 确保从公开页面导航到受保护页面时导航栏不会消失。
 */
import type { ReactNode } from "react";
import { useEffect, Suspense, lazy } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Crown, Sparkles } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
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

const AUTH_USER_KEY = "supply_os_auth_user";

/** VIP 门槛面板：文案复用 membership 命名空间现有键（6 语言零新增） */
function VipGatePanel() {
  const { t } = useLocale();
  const router = useRouter();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
        <Crown className="h-7 w-7 text-amber-600" />
      </div>
      <h2 className="text-lg font-extrabold text-slate-800">{t("membershipRequired")}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">{t("tabMembershipDesc")}</p>
      <button
        type="button"
        onClick={() => router.push("/membership")}
        className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-700 px-6 py-3 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.02]"
      >
        <Sparkles className="h-4 w-4" />
        {t("membershipBuyNow")}
      </button>
    </div>
  );
}

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
      // 二次防护：localStorage 中有已保存用户 → 认证正在异步恢复中，不可重定向
      // 根因：AuthContext 中 persistAuthUser(setAuthUser) 是 React 批处理，
      //       refreshAuth().finally(setAuthReady) 是异步 API 调用，
      //       两者存在时序竞争窗口：authReady=true 但 authUser 尚未完成状态更新
      const hasSavedUser = typeof window !== "undefined" && !!window.localStorage.getItem(AUTH_USER_KEY);
      if (hasSavedUser) return;
      emitAppEvent("supply-os:require-login");
      router.replace("/showroom");
    }
    // 非 VIP 不再重定向：由 VipGatePanel 原地承接（保留 URL + 可导航 + 升级 CTA）
  }, [authReady, needLogin, router]);

  const handlePaymentSuccess = () => {
    if (paymentPlan?.noticeId) emitAppEvent("supply-os:notice-paid", { noticeId: paymentPlan.noticeId });
    setShowPaymentModal(false);
    setPaymentPlan(null);
    refreshAuth().catch(() => {
      console.warn("[payment] 支付成功后刷新用户状态失败，用户可能需要手动刷新页面");
    });
  };

  const isTrainingPage = pathname === "/training" || pathname === "/procurement/qualification";

  /** 认证初始化/恢复期间的骨架壳（也承接已登出用户重定向前的一瞬，避免空白闪屏） */
  const bootShell = (
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

  if (!authReady) return bootShell;
  // needLogin：恢复窗口期（hasSavedUser）渲染 spinner；真正未登录则由 effect 立即重定向
  if (needLogin) return bootShell;

  return (
    // flex 纵向 + min-h-screen：内容切换/门槛面板高度有限时页脚钉在视口底部
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
        {needVip ? <VipGatePanel /> : children}
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
