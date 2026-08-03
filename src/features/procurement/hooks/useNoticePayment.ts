/**
 * 采购公告内嵌付费面板状态 Hook
 * Notice-embedded Payment Panel State Hook
 *
 * @module features/procurement/hooks/useNoticePayment
 * @description 管理采购详情页内嵌多套餐付费面板的付费墙状态、订单创建、
 *              模拟支付确认与 3 秒轮询对账，成功后回调页面完成解锁。
 *              Manages the paywall state, order creation, mock-payment
 *              confirmation and 3s polling for the notice-embedded multi-plan
 *              payment panel; invokes a callback to unlock on success.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/core/i18n";
import { createOrder, getOrderStatus, mockPaid, type OrderInfo } from "@/features/payment";
import type { NoticeItem } from "../types";

/** 面板支持的支付方式（微信暂未开通，仅支付宝可用） */
export type PanelProvider = "alipay" | "wechat";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 80;

export type UseNoticePaymentOptions = {
  /** 当前登录用户 key，无则触发登录 */
  userKey?: string;
  /** 未登录时的回调（弹出登录） */
  onRequireLogin: () => void;
  /** 支付成功（mock 或轮询到 paid）后的解锁回调 */
  onPaid: (noticeId: number, planCode: string) => void | Promise<void>;
};

export type UseNoticePaymentReturn = {
  paywallNotice: NoticeItem | null;
  paymentOrder: OrderInfo | null;
  paymentProvider: PanelProvider;
  busyPlanCode: string;
  paymentMessage: string;
  setPaymentProvider: (provider: PanelProvider) => void;
  openPaywall: (notice: NoticeItem) => void;
  closePaywall: () => void;
  createNoticeOrder: (planCode: string) => Promise<void>;
  markPaid: () => Promise<void>;
};

export function useNoticePayment({
  userKey,
  onRequireLogin,
  onPaid,
}: UseNoticePaymentOptions): UseNoticePaymentReturn {
  const { t } = useLocale();
  const [paywallNotice, setPaywallNotice] = useState<NoticeItem | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<OrderInfo | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<PanelProvider>("alipay");
  const [busyPlanCode, setBusyPlanCode] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // 组件卸载时清理轮询
  useEffect(() => stopPolling, [stopPolling]);

  const openPaywall = useCallback((notice: NoticeItem) => {
    setPaywallNotice(notice);
    setPaymentOrder(null);
    setPaymentMessage("");
  }, []);

  const closePaywall = useCallback(() => {
    stopPolling();
    setPaywallNotice(null);
    setPaymentOrder(null);
    setPaymentMessage("");
    setBusyPlanCode("");
  }, [stopPolling]);

  const startPolling = useCallback(
    (orderNo: string, planCode: string, noticeId: number) => {
      stopPolling();
      let attempts = 0;
      pollingRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const status = await getOrderStatus(orderNo);
          if (status.status === "paid") {
            stopPolling();
            setPaymentMessage(t("procurement_paidOk"));
            await onPaid(noticeId, planCode);
          } else if (status.status === "closed" || status.status === "failed") {
            stopPolling();
            setPaymentMessage(t("procurement_paidFail"));
          }
        } catch {
          // 网络抖动时静默重试，直至超时
        }
        if (attempts >= POLL_MAX_ATTEMPTS) {
          stopPolling();
          setPaymentMessage(t("procurement_paidFail"));
        }
      }, POLL_INTERVAL_MS);
    },
    [onPaid, stopPolling, t],
  );

  const createNoticeOrder = useCallback(
    async (planCode: string) => {
      if (busyPlanCode) return;
      if (!userKey || !paywallNotice) {
        onRequireLogin();
        return;
      }

      setBusyPlanCode(planCode);
      setPaymentMessage("");

      try {
        const order: OrderInfo = await createOrder({
          userKey,
          planCode,
          provider: paymentProvider,
          noticeId: paywallNotice.id,
          returnUrl: `${window.location.origin}/procurement?notice_id=${paywallNotice.id}`,
        });
        setPaymentOrder({ ...order, plan_code: planCode });
        setPaymentMessage(t("procurement_orderCreated"));
        if (order.pay_url && order.provider !== "mock") {
          const payWindow = window.open(order.pay_url, "_blank");
          if (!payWindow) window.location.href = order.pay_url;
        }
        startPolling(order.order_no, planCode, paywallNotice.id);
      } catch (err) {
        setPaymentMessage((err as Error)?.message || t("procurement_orderFail"));
      } finally {
        setBusyPlanCode("");
      }
    },
    [busyPlanCode, userKey, paywallNotice, paymentProvider, startPolling, onRequireLogin, t],
  );

  const markPaid = useCallback(async () => {
    if (!paymentOrder || !paywallNotice) return;
    try {
      await mockPaid(paymentOrder.order_no);
    } catch {
      setPaymentMessage(t("procurement_paidFail"));
      return;
    }
    stopPolling();
    setPaymentMessage(t("procurement_paidOk"));
    await onPaid(paywallNotice.id, paymentOrder.plan_code || "");
    setPaymentOrder(null);
  }, [paymentOrder, paywallNotice, onPaid, stopPolling, t]);

  return {
    paywallNotice,
    paymentOrder,
    paymentProvider,
    busyPlanCode,
    paymentMessage,
    setPaymentProvider,
    openPaywall,
    closePaywall,
    createNoticeOrder,
    markPaid,
  };
}
