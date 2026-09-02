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

import { lazy, Suspense, useEffect, useState } from "react";
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

/** 模态框加载骨架屏 - 移动端弱网环境下提供视觉反馈 */
function ModalSkeleton() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl p-8 min-w-[300px] animate-pulse shadow-2xl">
        <div className="h-6 bg-slate-200 rounded mb-4 w-3/4" />
        <div className="h-10 bg-slate-200 rounded mb-3" />
        <div className="h-10 bg-slate-200 rounded" />
      </div>
    </div>
  );
}

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

  // ★ 扫码推广自动弹出注册弹窗：检测 /r/[code] 中转页写入的 qr_auto_open Cookie
  // （兼容旧版二维码的 URL ?qr=1 参数）。Cookie 由浏览器 JS 写入，不依赖服务端跨重定向 Set-Cookie。
  const [qrRegisterMode, setQrRegisterMode] = useState(false);
  useEffect(() => {
    const hasCookie = /(?:^|;\s*)qr_auto_open=/.test(document.cookie);
    const hasParam = new URLSearchParams(window.location.search).get("qr") === "1";
    if (hasCookie || hasParam) {
      setQrRegisterMode(true);
      setShowAuthModal(true);
      // 清除信号，防止刷新重复弹出
      document.cookie = "qr_auto_open=; path=/; max-age=0";
      if (hasParam) {
        const params = new URLSearchParams(window.location.search);
        params.delete("qr");
        const clean = params.toString();
        // 用 history API 清参数，避免触发 Next 路由重渲染
        window.history.replaceState(null, "", clean ? `${window.location.pathname}?${clean}` : window.location.pathname);
      }
    }
  }, []);

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
        <Suspense fallback={<ModalSkeleton />}>
          <AuthModal
            initialMode={qrRegisterMode ? "register" : "login"}
            onClose={() => {
              setShowAuthModal(false);
              setQrRegisterMode(false);
            }}
          />
        </Suspense>
      )}
      {showConsultForm && (
        <Suspense fallback={<ModalSkeleton />}>
          <ConsultForm onClose={() => setShowConsultForm(false)} />
        </Suspense>
      )}
      {showTrainingRegisterForm && (
        <Suspense fallback={<ModalSkeleton />}>
          <TrainingRegisterForm onClose={() => setShowTrainingRegisterForm(false)} />
        </Suspense>
      )}
      {showPaymentModal && paymentPlan && authUser && (
        <Suspense fallback={<ModalSkeleton />}>
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
