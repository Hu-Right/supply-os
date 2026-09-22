/**
 * 支付流程状态机 Hook（跨 feature 共享）
 * Payment Flow State Machine Hook
 *
 * @module shared/hooks/usePaymentFlow
 * @description 从 features/payment/hooks 提升至 shared 层，
 *              消除 training → payment 跨 feature 硬依赖。
 *              管理支付状态机（choose → waiting → success/failed）、轮询、通道配置检查。
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  fetchPaymentConfigStatus,
  getAvailableProviders,
  detectPlatformEnv,
  mapPaymentError,
  type PaymentConfigStatus,
} from "@/core/payment";
import { usePaymentPolling } from "./usePaymentPolling";

export type PaymentModalStep = "choose" | "waiting" | "success" | "failed";

/** 适配器返回的统一订单形状 */
export interface PaymentModalOrder {
  order_no: string;
  provider: string;
  /** 二维码图片（data URL）；存在时 waiting 页直接展示二维码（零跳转主路径） */
  qr_code?: string | null;
  pay_url?: string | null;
}

export interface UsePaymentFlowOptions {
  canSubmit?: boolean;
  onCreateOrder: (provider: "alipay" | "wechat") => Promise<PaymentModalOrder>;
  onQueryStatus: (orderNo: string) => Promise<{ status: string }>;
  onMockConfirm?: (orderNo: string) => Promise<void>;
  onSuccess?: (orderNo: string) => void;
  t: (key: string) => string;
}

export interface UsePaymentFlowReturn {
  step: PaymentModalStep;
  order: PaymentModalOrder | null;
  isCreating: boolean;
  error: string;
  paymentConfig: PaymentConfigStatus | null;
  provider: "alipay" | "wechat";
  providers: Array<{ provider: "alipay" | "wechat"; icon: string; recommended?: boolean }>;
  handleSelectProvider: (p: "alipay" | "wechat") => void;
  handleCreateOrder: () => Promise<void>;
  handleMockConfirm: () => Promise<void>;
  handleRetry: () => void;
  handleOpenPayUrl: () => void;
  getProviderTip: (p: "alipay" | "wechat") => string;
  qrImage: string | null;
}

export function usePaymentFlow({
  canSubmit = true,
  onCreateOrder,
  onQueryStatus,
  onMockConfirm,
  onSuccess,
  t,
}: UsePaymentFlowOptions): UsePaymentFlowReturn {
  const [step, setStep] = useState<PaymentModalStep>("choose");
  const [order, setOrder] = useState<PaymentModalOrder | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigStatus | null>(null);

  const providers = useMemo(() => getAvailableProviders(), []);
  const [provider, setProvider] = useState<"alipay" | "wechat">(providers[0]?.provider ?? "alipay");

  // 弹窗打开时获取支付通道配置状态
  useEffect(() => {
    fetchPaymentConfigStatus()
      .then(setPaymentConfig)
      .catch((e) => {
        console.warn("[PaymentFlow] 支付通道配置加载失败:", e);
        setPaymentConfig(null);
      });
  }, []);

  // 配置加载后若当前选中方式未开通，自动切换到第一个已开通的方式
  useEffect(() => {
    if (!paymentConfig) return;
    if (!paymentConfig[provider]) {
      const firstAvailable = providers.find((item) => paymentConfig[item.provider]);
      if (firstAvailable) setProvider(firstAvailable.provider);
    }
  }, [paymentConfig, provider, providers]);

  // ── 轮询（委托至 usePaymentPolling SSOT）──
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const { startPolling, stopPolling } = usePaymentPolling({
    queryStatus: onQueryStatus,
    onPaid: (orderNo) => {
      setStep("success");
      onSuccessRef.current?.(orderNo);
    },
    onFailed: () => {
      setStep("failed");
      setError(t("paymentTimeoutError"));
    },
    onTimeout: () => {
      setStep("failed");
      setError(t("paymentTimeoutError"));
    },
  });

  const handleSelectProvider = useCallback(
    (p: "alipay" | "wechat") => {
      if (paymentConfig && !paymentConfig[p]) return;
      setError("");
      setProvider(p);
    },
    [paymentConfig],
  );

  const handleCreateOrder = useCallback(async () => {
    if (!canSubmit) return;
    if (paymentConfig && !paymentConfig[provider]) {
      setError(t("paymentUnavailableTip"));
      return;
    }
    setIsCreating(true);
    setError("");
    try {
      const created = await onCreateOrder(provider);
      setOrder(created);
      setStep("waiting");
      startPolling(created.order_no);
    } catch (err) {
      console.warn("[PaymentModalCore] create order failed:", err);
      setError(mapPaymentError(err));
    } finally {
      setIsCreating(false);
    }
  }, [canSubmit, paymentConfig, provider, onCreateOrder, startPolling, t]);

  const handleMockConfirm = useCallback(async () => {
    if (!order || !onMockConfirm) return;
    try {
      await onMockConfirm(order.order_no);
      stopPolling();
      setStep("success");
      onSuccessRef.current?.(order.order_no);
    } catch {
      setStep("failed");
    }
  }, [order, onMockConfirm, stopPolling]);

  const handleRetry = useCallback(() => {
    setStep("choose");
    setOrder(null);
    setError("");
  }, []);

  const handleOpenPayUrl = useCallback(() => {
    if (order?.pay_url && order.provider !== "mock") {
      window.open(order.pay_url, "_blank");
    }
  }, [order]);

  const getProviderTip = useCallback(
    (p: "alipay" | "wechat") => {
      const env = detectPlatformEnv();
      if (p === "alipay") {
        return env === "wechat" ? t("paymentAlipayTipWechat") : t("paymentAlipayTipPC");
      }
      return env === "wechat" ? t("paymentWechatTipWechat") : t("paymentWechatTipPC");
    },
    [t],
  );

  const qrImage = order?.qr_code && order.qr_code.startsWith("data:image") ? order.qr_code : null;

  return {
    step,
    order,
    isCreating,
    error,
    paymentConfig,
    provider,
    providers,
    handleSelectProvider,
    handleCreateOrder,
    handleMockConfirm,
    handleRetry,
    handleOpenPayUrl,
    getProviderTip,
    qrImage,
  };
}
