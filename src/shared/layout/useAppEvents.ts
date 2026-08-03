/**
 * 全局应用事件监听 Hook
 * Global App Event Listener Hook
 *
 * @module shared/layout/useAppEvents
 * @description 统一注册 supply-os:* 自定义事件到 window，驱动 AuthModal / PaymentModal / ConsultForm 等全局弹窗。
 */
import { useEffect } from "react";
import { onAppEvent } from "@/core/events";
import type { PayEventDetail } from "@/core/events";

export interface AppEventHandlers {
  onRequireLogin: () => void;
  onConsult: () => void;
  onPay: (detail: PayEventDetail) => void;
}

export function useAppEvents(handlers: AppEventHandlers) {
  useEffect(() => {
    const unsubs = [
      onAppEvent("supply-os:require-login", () => handlers.onRequireLogin()),
      onAppEvent("supply-os:unauthorized", () => handlers.onRequireLogin()),
      onAppEvent("supply-os:require-vip", () => handlers.onRequireLogin()),
      onAppEvent("supply-os:open-account", () => handlers.onRequireLogin()),
      onAppEvent("supply-os:consult", () => handlers.onConsult()),
      onAppEvent("supply-os:pay", (detail) => { if (detail) handlers.onPay(detail); }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [handlers]);
}
