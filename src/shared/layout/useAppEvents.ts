/**
 * 全局应用事件监听 Hook
 * Global App Event Listener Hook
 *
 * @module shared/layout/useAppEvents
 * @description 统一注册 supply-os:* 自定义事件到 window，驱动 AuthModal / PaymentModal / ConsultForm 等全局弹窗。
 */
import { useEffect } from "react";

export interface AppEventHandlers {
  onRequireLogin: () => void;
  onConsult: () => void;
  onPay: (detail: { code: string; name: string; price: number; currency: string; noticeId?: number | null; returnUrl?: string }) => void;
}

export function useAppEvents(handlers: AppEventHandlers) {
  useEffect(() => {
    const onRequireLogin = () => handlers.onRequireLogin();
    const onUnauthorized = () => handlers.onRequireLogin();
    const onRequireVip = () => handlers.onRequireLogin();
    const onOpenAccount = () => handlers.onRequireLogin();
    const onConsult = () => handlers.onConsult();
    const onPay = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) handlers.onPay(detail);
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
  }, [handlers]);
}
