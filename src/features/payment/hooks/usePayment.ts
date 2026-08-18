/**
 * 支付状态管理 Hook
 * Payment State Management Hook
 *
 * @module features/payment/hooks/usePayment
 * @description 管理支付订单创建、轮询状态、错误处理等逻辑
 *              Manages payment order creation, status polling, error handling
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getAvailableProviders, mapPaymentError } from "@/core/payment";
import { useLocale } from "@/core/i18n";
import { createOrder, getOrderStatus, type OrderInfo } from "../api";

export type PaymentStep = "choose" | "waiting" | "success" | "failed";

export type UsePaymentOptions = {
  planCode: string;
  userKey: string;
  noticeId?: number | null;
  returnUrl?: string;
  /** 订单类型：'new'（新购，默认）/ 'upgrade'（升级补差） */
  orderType?: "new" | "upgrade";
  /** 升级时的当前套餐 code（服务端校验用） */
  originalPlanCode?: string;
  onPaymentSuccess: (orderNo: string) => void;
};

export type UsePaymentReturn = {
  /** 当前支付步骤 */
  step: PaymentStep;
  /** 订单信息 */
  orderInfo: OrderInfo | null;
  /** 错误消息 */
  error: string;
  /** 是否正在创建订单 */
  isCreating: boolean;
  /** 当前选中的支付提供商 */
  selectedProvider: "alipay" | "wechat" | "mock";
  /** 切换支付提供商 */
  setSelectedProvider: (p: "alipay" | "wechat" | "mock") => void;
  /** 可用的支付提供商列表 */
  availableProviders: ReturnType<typeof getAvailableProviders>;
  /** 创建订单 */
  handleCreateOrder: () => Promise<void>;
  /** 重试 */
  handleRetry: () => void;
  /** 打开支付链接 */
  handleOpenPayUrl: () => void;
  /** 复制支付链接 */
  handleCopyPayUrl: () => void;
};

/**
 * 支付 Hook
 * Payment Hook
 *
 * 管理支付流程：选择支付方式 → 创建订单 → 轮询状态 → 完成/失败
 * Manages payment flow: choose method → create order → poll status → complete/fail
 */
export function usePayment({
  planCode,
  userKey,
  noticeId,
  returnUrl,
  orderType,
  originalPlanCode,
  onPaymentSuccess,
}: UsePaymentOptions): UsePaymentReturn {
  const { t } = useLocale();
  const [step, setStep] = useState<PaymentStep>("choose");
  const [selectedProvider, setSelectedProvider] = useState<"alipay" | "wechat" | "mock">("mock");
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const availableProviders = getAvailableProviders();

  // 自动选择第一个可用的支付提供商
  useEffect(() => {
    if (availableProviders.length > 0 && !availableProviders.some((item) => item.provider === selectedProvider)) {
      setSelectedProvider(availableProviders[0].provider);
    }
  }, [availableProviders, selectedProvider]);

  // 清理轮询定时器
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  /**
   * 开始轮询订单状态
   * Start polling order status
   */
  const startPolling = useCallback(
    (orderNo: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(async () => {
        try {
          const data = await getOrderStatus(orderNo);
          if (data.status === "paid") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setOrderInfo((prev) => (prev ? { ...prev, status: "paid" } : null));
            setStep("success");
            onPaymentSuccess(orderNo);
          } else if (data.status === "closed" || data.status === "failed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setStep("failed");
            setError(t("paymentTimeoutError"));
          }
        } catch {
          // silent polling
        }
      }, 3000);
    },
    [onPaymentSuccess, t],
  );

  /**
   * 创建订单
   * Create order
   */
  const handleCreateOrder = async () => {
    setIsCreating(true);
    setError("");

    try {
      const order = await createOrder({
        userKey,
        planCode,
        provider: selectedProvider,
        noticeId,
        returnUrl,
        orderType,
        originalPlanCode,
      });
      setOrderInfo(order);
      setStep("waiting");

      if (order.provider === "mock") {
        // mock 模式：pay_url 为无效地址（/mock-payment?...），不打开；直接轮询等待自动完成
        startPolling(order.order_no);
      } else {
        const payWindow = window.open(order.pay_url, "_blank");
        if (!payWindow) window.location.href = order.pay_url;
        startPolling(order.order_no);
      }
    } catch (err: unknown) {
      // 将技术性错误（如 "Unsupported payment provider: wechat"）映射为友好提示，不暴露原始日志
      console.warn("[usePayment] create order failed:", err);
      setError(mapPaymentError(err));
    } finally {
      setIsCreating(false);
    }
  };

  /**
   * 重试
   * Retry
   */
  const handleRetry = () => {
    setStep("choose");
    setOrderInfo(null);
    setError("");
  };

  /**
   * 打开支付链接
   * Open payment URL
   */
  const handleOpenPayUrl = () => {
    // mock 模式下 pay_url 为无效地址，不打开
    if (orderInfo?.pay_url && orderInfo.provider !== "mock") {
      window.open(orderInfo.pay_url, "_blank");
    }
  };

  /**
   * 复制支付链接
   * Copy payment URL
   */
  const handleCopyPayUrl = () => {
    if (orderInfo?.pay_url) navigator.clipboard.writeText(orderInfo.pay_url).catch(() => {});
  };

  return {
    step,
    orderInfo,
    error,
    isCreating,
    selectedProvider,
    setSelectedProvider,
    availableProviders,
    handleCreateOrder,
    handleRetry,
    handleOpenPayUrl,
    handleCopyPayUrl,
  };
}
