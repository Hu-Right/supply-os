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
import { fetchPaymentConfigStatus, mapPaymentError, PAYMENT_POLL_INTERVAL_MS, PAYMENT_POLL_MAX_ATTEMPTS, type PaymentConfigStatus } from "@/core/payment";
import { createOrder, getOrderStatus, mockPaid, type OrderInfo } from "@/features/payment";
import type { NoticeItem } from "../types";

/** 面板支持的支付方式（微信暂未开通，仅支付宝可用） */
export type PanelProvider = "alipay" | "wechat";

// 轮询参数统一由 core/payment/constants 管理
const POLL_INTERVAL_MS = PAYMENT_POLL_INTERVAL_MS;
const POLL_MAX_ATTEMPTS = PAYMENT_POLL_MAX_ATTEMPTS;

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
  /** 支付通道配置状态（微信/支付宝是否已开通） */
  paymentConfig: PaymentConfigStatus | null;
  setPaymentProvider: (provider: PanelProvider) => void;
  openPaywall: (notice: NoticeItem) => void;
  closePaywall: () => void;
  createNoticeOrder: (planCode: string) => Promise<void>;
  markPaid: () => Promise<void>;
  /** 同步当前详情页公告 ID（非 VIP 侧边栏常驻面板场景） */
  setCurrentNoticeId: (id: number | null) => void;
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
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigStatus | null>(null);
  // 当前详情页公告 ID：非 VIP 侧边栏常驻面板场景，paywallNotice 为 null 时的回退来源
  const [currentNoticeId, setCurrentNoticeId] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // 组件卸载时清理轮询
  useEffect(() => stopPolling, [stopPolling]);

  // 启动时获取支付通道配置状态（微信/支付宝是否已开通）
  useEffect(() => {
    void fetchPaymentConfigStatus().then(setPaymentConfig);
  }, []);

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
    (orderNo: string, planCode: string, noticeId?: number) => {
      stopPolling();
      let attempts = 0;
      pollingRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const status = await getOrderStatus(orderNo);
          if (status.status === "paid") {
            stopPolling();
            setPaymentMessage(t("procurement_paidOk"));
            if (noticeId) await onPaid(noticeId, planCode);
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
      // 认证检查：仅需 userKey；paywallNotice 为 null 时回退到 currentNoticeId（侧边栏常驻面板场景）
      if (!userKey) {
        onRequireLogin();
        return;
      }
      const effectiveNoticeId = paywallNotice?.id ?? currentNoticeId;

      setBusyPlanCode(planCode);
      setPaymentMessage("");

      try {
        // 前端拦截：若所选支付方式未配置，提前阻止并给出友好提示
        if (paymentConfig && !paymentConfig[paymentProvider]) {
          setPaymentMessage(t("procurement_wechatUnavailableTip"));
          return;
        }

        const order: OrderInfo = await createOrder({
          planCode,
          provider: paymentProvider,
          noticeId: effectiveNoticeId,
          returnUrl: effectiveNoticeId
            ? `${window.location.origin}/procurement?notice_id=${effectiveNoticeId}`
            : `${window.location.origin}/procurement`,
        });
        setPaymentOrder({ ...order, plan_code: planCode });
        setPaymentMessage(t("procurement_orderCreated"));
        if (order.pay_url && order.provider !== "mock") {
          const payWindow = window.open(order.pay_url, "_blank");
          if (!payWindow) window.location.href = order.pay_url;
        }
        startPolling(order.order_no, planCode, effectiveNoticeId || undefined);
      } catch (err) {
        // 将技术性错误（如 "Unsupported payment provider: wechat"）映射为友好提示
        console.warn("[useNoticePayment] create order failed:", err);
        setPaymentMessage(mapPaymentError(err));
      } finally {
        setBusyPlanCode("");
      }
    },
    [busyPlanCode, userKey, paywallNotice, currentNoticeId, paymentProvider, paymentConfig, startPolling, onRequireLogin, t],
  );

  const markPaid = useCallback(async () => {
    const effectiveNoticeId = paywallNotice?.id ?? currentNoticeId;
    if (!paymentOrder) return;
    try {
      await mockPaid(paymentOrder.order_no);
    } catch {
      setPaymentMessage(t("procurement_paidFail"));
      return;
    }
    stopPolling();
    setPaymentMessage(t("procurement_paidOk"));
    if (effectiveNoticeId) {
      await onPaid(effectiveNoticeId, paymentOrder.plan_code || "");
    }
    setPaymentOrder(null);
  }, [paymentOrder, paywallNotice, currentNoticeId, onPaid, stopPolling, t]);

  return {
    paywallNotice,
    paymentOrder,
    paymentProvider,
    busyPlanCode,
    paymentMessage,
    paymentConfig,
    setPaymentProvider,
    openPaywall,
    closePaywall,
    createNoticeOrder,
    markPaid,
    setCurrentNoticeId,
  };
}
