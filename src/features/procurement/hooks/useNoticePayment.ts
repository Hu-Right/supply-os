/**
 * 采购公告内嵌付费面板状态 Hook
 * Notice-embedded Payment Panel State Hook
 *
 * @module features/procurement/hooks/useNoticePayment
 * @description 管理采购详情页内嵌多套餐付费面板的付费墙状态、订单创建、
 *              模拟支付确认与 3 秒轮询对账，成功后回调页面完成解锁。
 *              ARCH-P2（2026-09-01）：轮询基础设施委托至 usePaymentPolling SSOT。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/core/i18n";
import { fetchPaymentConfigStatus, mapPaymentError, type PaymentConfigStatus } from "@/core/payment";
import { createOrder, getOrderStatus, mockPaid, type OrderInfo } from "@/core/payment/payment-facade";
import { usePaymentPolling } from "@/shared/hooks/usePaymentPolling";
import type { NoticeItem } from "../types";

/** 面板支持的支付方式（微信暂未开通，仅支付宝可用） */
export type PanelProvider = "alipay" | "wechat";

export type UseNoticePaymentOptions = {
  /** 当前登录用户 key，无则触发登录 */
  userId?: number;
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
  userId,
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

  // ── 轮询上下文 ref（startPolling 仅接收 orderNo，额外参数通过 ref 传递）──
  const pollPlanCodeRef = useRef("");
  const pollNoticeIdRef = useRef<number | undefined>(undefined);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const { startPolling: startPollingCore, stopPolling } = usePaymentPolling({
    queryStatus: (orderNo) => getOrderStatus(orderNo),
    onPaid: async () => {
      setPaymentMessage(t("procurement_paidOk"));
      const noticeId = pollNoticeIdRef.current;
      if (noticeId) await onPaidRef.current(noticeId, pollPlanCodeRef.current);
    },
    onFailed: () => {
      setPaymentMessage(t("procurement_paidFail"));
    },
    onTimeout: () => {
      setPaymentMessage(t("procurement_paidFail"));
    },
  });

  // 包装 startPolling：存储轮询上下文后启动核心轮询
  const startPolling = useCallback(
    (orderNo: string, planCode: string, noticeId?: number) => {
      pollPlanCodeRef.current = planCode;
      pollNoticeIdRef.current = noticeId;
      startPollingCore(orderNo);
    },
    [startPollingCore],
  );

  // 启动时获取支付通道配置状态（微信/支付宝是否已开通）
  useEffect(() => {
    fetchPaymentConfigStatus()
      .then(setPaymentConfig)
      .catch(() => setPaymentConfig(null));
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

  const createNoticeOrder = useCallback(
    async (planCode: string) => {
      if (busyPlanCode) return;
      // 认证检查：仅需 userId；paywallNotice 为 null 时回退到 currentNoticeId（侧边栏常驻面板场景）
      if (!userId) {
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
    [busyPlanCode, userId, paywallNotice, currentNoticeId, paymentProvider, paymentConfig, startPolling, onRequireLogin, t],
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
