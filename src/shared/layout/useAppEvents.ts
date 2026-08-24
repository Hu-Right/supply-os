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
  onOpenTrainingRegister: () => void;
}

export function useAppEvents(handlers: AppEventHandlers) {
  useEffect(() => {
    // 注意：不订阅 supply-os:unauthorized —— 被动 401（游客访问需登录接口、
    // 会话过期后的后台请求）不应自动弹出登录框；登录弹窗仅由用户主动操作
    // （require-login / open-account / require-vip）触发。
    const unsubs = [
      onAppEvent("supply-os:require-login", () => handlers.onRequireLogin()),
      onAppEvent("supply-os:require-vip", () => handlers.onRequireLogin()),
      onAppEvent("supply-os:open-account", () => handlers.onRequireLogin()),
      onAppEvent("supply-os:consult", () => handlers.onConsult()),
      onAppEvent("supply-os:pay", (detail) => { if (detail) handlers.onPay(detail); }),
      onAppEvent("supply-os:open-training-register", () => handlers.onOpenTrainingRegister()),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [handlers]);
}
