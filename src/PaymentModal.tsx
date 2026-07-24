import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, CheckCircle2, Loader2, ExternalLink, AlertCircle, Smartphone } from "lucide-react";
import { getAvailableProviders, getPaymentTips, detectPlatformEnv, isMobile } from "./payment/env-detector";

// Local translation dictionary type.
type LangDict = Record<string, string>;

type PaymentModalProps = {
  planCode: string;
  planName: string;
  amount: number;
  currency: string;
  userKey: string;
  lang: "zh" | "en";
  t: LangDict;
  onClose: () => void;
  onPaymentSuccess: (orderNo: string) => void;
};

type OrderInfo = {
  order_no: string;
  pay_url: string;
  qr_code_url?: string;
  provider: "alipay" | "wechat" | "mock";
  status: "pending" | "paid" | "closed" | "failed";
};

type PaymentStep = "choose" | "waiting" | "success" | "failed";

export default function PaymentModal({
  planCode,
  planName,
  amount,
  currency,
  userKey,
  lang,
  t,
  onClose,
  onPaymentSuccess,
}: PaymentModalProps) {
  const [step, setStep] = useState<PaymentStep>("choose");
  const [selectedProvider, setSelectedProvider] = useState<"alipay" | "wechat" | "mock">("mock");
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mobile = isMobile();

  const availableProviders = getAvailableProviders();

  useEffect(() => {
    if (availableProviders.length > 0 && !availableProviders.some((item) => item.provider === selectedProvider)) {
      setSelectedProvider(availableProviders[0].provider);
    }
  }, [availableProviders, selectedProvider]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const startPolling = useCallback(
    (orderNo: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/payment/orders/${orderNo}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.status === "paid") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setOrderInfo((prev) => prev ? { ...prev, status: "paid" } : null);
            setStep("success");
            onPaymentSuccess(orderNo);
          } else if (data.status === "closed" || data.status === "failed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setStep("failed");
            setError(t.paymentTimeoutError);
          }
        } catch {
          // silent polling
        }
      }, 3000);
    },
    [onPaymentSuccess, t],
  );

  const handleCreateOrder = async () => {
    setIsCreating(true);
    setError("");

    try {
      const res = await fetch("/api/payment/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_key: userKey,
          plan_code: planCode,
          provider: selectedProvider,
          return_url: window.location.origin + window.location.pathname,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t.paymentCreateError);
      }

      const order = await res.json();
      setOrderInfo(order);
      setStep("waiting");

      if (order.provider === "mock") {
        // 后端 mock 模式：自动轮询订单状态。
        startPolling(order.order_no);
      } else {
        // 真实支付：创建订单成功后打开支付页面。
        const payWindow = window.open(order.pay_url, "_blank");
        if (!payWindow) window.location.href = order.pay_url;
        startPolling(order.order_no);
      }
    } catch (err: any) {
      console.error("[PaymentModal] 鍒涘缓璁㈠崟澶辫触:", err);
      setError(err.message || t.paymentCreateError);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenPayUrl = () => {
    if (orderInfo?.pay_url) window.open(orderInfo.pay_url, "_blank");
  };

  const handleRetry = () => {
    setStep("choose");
    setOrderInfo(null);
    setError("");
  };

  const handleCopyPayUrl = () => {
    if (orderInfo?.pay_url) navigator.clipboard.writeText(orderInfo.pay_url).catch(() => {});
  };

  const getProviderLabel = (provider: string) =>
    provider === "alipay" ? t.paymentAlipay : t.paymentWechat;

  const currencySymbol = currency === "CNY" ? "¥" : "$";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-3xl border-2 border-slate-800 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.15)] max-w-md w-full max-h-[90vh] overflow-y-auto" lang={lang}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b-2 border-slate-200">
          <h2 className="text-lg font-black text-slate-900">{t.paymentTitle}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 濂楅淇℃伅 */}
          <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-bold text-slate-600">{planName}</span>
              <span className="text-xs bg-slate-800 text-white px-2 py-0.5 rounded-full font-mono">
                {t.paymentPlanLabel}: {planCode}
              </span>
            </div>
            <div className="text-3xl font-black text-slate-900">
              {currencySymbol}{amount.toFixed(2)}
            </div>
          </div>

          {/* Step: Choose provider */}
          {step === "choose" && (
            <>
              <p className="text-sm font-bold text-slate-700">{t.paymentSelectMethod}</p>
              <div className="space-y-2">
                {availableProviders.map((provider) => (
                  <button
                    key={provider.provider}
                    onClick={() => setSelectedProvider(provider.provider)}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      selectedProvider === provider.provider
                        ? "border-teal-600 bg-teal-50 shadow-sm"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{provider.icon}</span>
                      <div className="text-left">
                        <div className="font-bold text-slate-800">{getProviderLabel(provider.provider)}</div>
                        <div className="text-xs text-slate-500">{getPaymentTips(provider.provider)}</div>
                      </div>
                    </div>
                    {provider.recommended && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-400 text-amber-900 rounded-full uppercase">
                        {t.paymentRecommended}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm font-bold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleCreateOrder}
                disabled={isCreating}
                className={`w-full py-3.5 rounded-2xl text-white font-black text-sm cursor-pointer transition-all ${
                  isCreating
                    ? "bg-slate-400"
                    : "bg-teal-600 hover:bg-teal-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.12)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.12)]"
                }`}
              >
                {isCreating ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t.paymentCreating}
                  </span>
                ) : (
                  `${t.paymentConfirmBtn} ${currencySymbol}${amount.toFixed(2)}`
                )}
              </button>
            </>
          )}

          {/* Step: Waiting */}
          {step === "waiting" && orderInfo && (
            <div className="text-center space-y-4">
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4">
                <Loader2 className="w-8 h-8 animate-spin text-amber-600 mx-auto mb-2" />
                <p className="font-bold text-amber-900 text-sm">{t.paymentWaitingTitle}</p>
                <p className="text-xs text-amber-700 mt-1">{selectedProvider === "mock" ? "本地模拟支付会自动完成，用于测试支付闭环。" : getPaymentTips(selectedProvider)}</p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleOpenPayUrl}
                  className="w-full py-3 rounded-2xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-700 cursor-pointer flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t.paymentReOpenBtn}
                </button>
                {!mobile && (
                  <button
                    onClick={handleCopyPayUrl}
                    className="w-full py-2 rounded-2xl border-2 border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                  >
                    {t.paymentCopyLink}
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-400">{t.paymentWaitingDesc}</p>
            </div>
          )}

          {/* Step: Success */}
          {step === "success" && (
            <div className="text-center space-y-4">
              <div className="bg-teal-50 border-2 border-teal-300 rounded-2xl p-5">
                <CheckCircle2 className="w-12 h-12 text-teal-600 mx-auto mb-3" />
                <p className="font-black text-teal-800 text-lg">{t.paymentSuccessTitle}</p>
                <p className="text-sm text-teal-700 mt-1">{t.paymentSuccessDesc}</p>
                {orderInfo && (
                  <p className="text-xs text-teal-500 mt-2 font-mono">
                    {t.paymentOrderNo}: {orderInfo.order_no}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-2xl bg-teal-600 text-white font-black text-sm cursor-pointer hover:bg-teal-700"
              >
                {t.paymentDoneBtn}
              </button>
            </div>
          )}

          {/* Step: Failed */}
          {step === "failed" && (
            <div className="text-center space-y-4">
              <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5">
                <AlertCircle className="w-12 h-12 text-rose-600 mx-auto mb-3" />
                <p className="font-black text-rose-800 text-lg">{t.paymentFailedTitle}</p>
                <p className="text-sm text-rose-700 mt-1">{error || t.paymentFailedDesc}</p>
              </div>
              <button
                onClick={handleRetry}
                className="w-full py-3 rounded-2xl bg-rose-600 text-white font-black text-sm cursor-pointer hover:bg-rose-700"
              >
                {t.paymentRetryBtn}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
