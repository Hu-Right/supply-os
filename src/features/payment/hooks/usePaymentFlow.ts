/**
 * 支付流程状态机 Hook
 * Payment Flow State Machine Hook
 *
 * @module features/payment/hooks/usePaymentFlow
 * @description ARCH-P3c（2026-08-31）：从 PaymentModalCore.tsx 拆分。
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
import { PAYMENT_POLL_INTERVAL_MS, PAYMENT_POLL_MAX_ATTEMPTS } from "@/core/payment";
import type { PaymentModalOrder } from "../components/PaymentModalCore";

const MAX_POLL_ATTEMPTS = PAYMENT_POLL_MAX_ATTEMPTS;
const POLL_INTERVAL_MS = PAYMENT_POLL_INTERVAL_MS;

export type PaymentModalStep = "choose" | "waiting" | "success" | "failed";

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
      .catch(() => setPaymentConfig(null));
  }, []);

  // 配置加载后若当前选中方式未开通，自动切换到第一个已开通的方式
  useEffect(() => {
    if (!paymentConfig) return;
    if (!paymentConfig[provider]) {
      const firstAvailable = providers.find((item) => paymentConfig[item.provider]);
      if (firstAvailable) setProvider(firstAvailable.provider);
    }
  }, [paymentConfig, provider, providers]);

  // ── 轮询 ──
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const pollEpochRef = useRef(0);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const stopPolling = useCallback(() => {
    pollEpochRef.current += 1;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (orderNo: string) => {
      stopPolling();
      pollCountRef.current = 0;
      const epoch = pollEpochRef.current;
      pollingRef.current = setInterval(async () => {
        pollCountRef.current += 1;
        if (pollCountRef.current > MAX_POLL_ATTEMPTS) {
          stopPolling();
          setStep("failed");
          setError(t("paymentTimeoutError"));
          return;
        }
        try {
          const data = await onQueryStatus(orderNo);
          if (epoch !== pollEpochRef.current) return;
          if (data.status === "paid") {
            stopPolling();
            setStep("success");
            onSuccessRef.current?.(orderNo);
          } else if (data.status === "closed" || data.status === "failed" || data.status === "expired") {
            stopPolling();
            setStep("failed");
            setError(t("paymentTimeoutError"));
          }
        } catch {
          // 忽略单次轮询失败
        }
      }, POLL_INTERVAL_MS);
    },
    [onQueryStatus, stopPolling, t],
  );

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
