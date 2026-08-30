/**
 * 统一支付弹窗核心（零跳转弹窗支付，会员/研修班共用单一实现）
 * Unified Payment Modal Core (zero-redirect in-modal payment)
 *
 * @module features/payment/components/PaymentModalCore
 * @description 收敛原会员 PaymentModal（usePayment）与研修班 TrainingPaymentModal 两套分叉实现：
 *              - 打开即预检支付通道配置状态：未开通的方式置灰不可选，点击直接提示（不回退 mock）；
 *              - 零跳转：下单后不新开窗口，弹窗内展示二维码图片，用户扫码完成支付；
 *              - 统一状态机 choose → waiting → success / failed，3s 轮询并带 200 次上限；
 *              - 业务差异（下单/查单/mock 确认/文案/配色）通过适配器 props 注入，核心不感知具体业务 API。
 */

import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { useLocale } from "@/core/i18n";
import {
  fetchPaymentConfigStatus,
  getAvailableProviders,
  detectPlatformEnv,
  mapPaymentError,
  type PaymentConfigStatus,
} from "@/core/payment";
import { PAYMENT_POLL_INTERVAL_MS, PAYMENT_POLL_MAX_ATTEMPTS } from "@/core/payment";
import { Button, Modal, SelectableCard } from "@/shared/ui";

export type PaymentModalStep = "choose" | "waiting" | "success" | "failed";

/** 适配器返回的统一订单形状 */
export interface PaymentModalOrder {
  order_no: string;
  provider: string;
  /** 二维码图片（data URL）；存在时 waiting 页直接展示二维码（零跳转主路径） */
  qr_code?: string | null;
  pay_url?: string | null;
}

/** 各环节文案覆写（缺省使用会员支付 payment* 文案） */
export interface PaymentModalTexts {
  waitingTitle?: string;
  waitingDesc?: string;
  successTitle?: string;
  successDesc?: string;
  failedTitle?: string;
  mockNote?: string;
}

export interface PaymentModalCoreProps {
  onClose: () => void;
  /** 弹窗标题 */
  title: string;
  /** 订单金额（展示于确认按钮） */
  amount: number;
  currency: string;
  /** 摘要卡片内容（套餐/课程信息） */
  summaryNode: ReactNode;
  /** choose 步骤支付方式选择前的附加内容（如研修班参训人数选择器） */
  chooseExtra?: ReactNode;
  /** 是否允许提交（附加业务校验，如课程有效性） */
  canSubmit?: boolean;
  /** 确认按钮配色（会员 teal / 研修班 red） */
  accent?: "teal" | "red";
  texts?: PaymentModalTexts;
  /** 创建订单适配器（失败直接 throw，核心统一映射友好提示） */
  onCreateOrder: (provider: "alipay" | "wechat") => Promise<PaymentModalOrder>;
  /** 轮询订单状态适配器 */
  onQueryStatus: (orderNo: string) => Promise<{ status: string }>;
  /** mock 订单手动确认（可选）；不传则等待 mock 通道自动到账 */
  onMockConfirm?: (orderNo: string) => Promise<void>;
  /** 支付成功回调（轮询到 paid 或 mock 确认后触发） */
  onSuccess?: (orderNo: string) => void;
}

// 轮询参数统一由 core/payment/constants 管理
const MAX_POLL_ATTEMPTS = PAYMENT_POLL_MAX_ATTEMPTS;
const POLL_INTERVAL_MS = PAYMENT_POLL_INTERVAL_MS;

export default function PaymentModalCore({
  onClose,
  title,
  amount,
  currency,
  summaryNode,
  chooseExtra,
  canSubmit = true,
  accent = "teal",
  texts,
  onCreateOrder,
  onQueryStatus,
  onMockConfirm,
  onSuccess,
}: PaymentModalCoreProps) {
  const { t } = useLocale();
  const currencySymbol = currency === "CNY" ? "¥" : "$";

  const [step, setStep] = useState<PaymentModalStep>("choose");
  const [order, setOrder] = useState<PaymentModalOrder | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigStatus | null>(null);

  // 平台相关的可用渠道列表在会话内稳定，按挂载计算一次
  const providers = useMemo(() => getAvailableProviders(), []);
  const [provider, setProvider] = useState<"alipay" | "wechat">(providers[0]?.provider ?? "alipay");

  // 弹窗打开时获取支付通道配置状态（各方式是否已开通）
  useEffect(() => {
    void fetchPaymentConfigStatus().then(setPaymentConfig);
  }, []);

  // 配置加载后若当前选中方式未开通，自动切换到第一个已开通的方式
  useEffect(() => {
    if (!paymentConfig) return;
    if (!paymentConfig[provider]) {
      const firstAvailable = providers.find((item) => paymentConfig[item.provider]);
      if (firstAvailable) setProvider(firstAvailable.provider);
    }
  }, [paymentConfig, provider, providers]);

  // ── 轮询（统一上限，会员/研修班一致） ──
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  // 轮询轮次令牌（审查 F44）：stop 后在途的慢响应必须失效，否则已 success/
  // failed 的弹窗可能被迟到响应二次触发 onSuccess
  const pollEpochRef = useRef(0);
  // ref 持有最新 onSuccess，避免轮询闭包捕获 stale 回调
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
          // 在途响应守卫：本轮轮询已被停止/重启时丢弃迟到响应
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

  /** 选择支付方式：未开通的方式无法选中（界面已置灰并标注“暂未开通”，不再重复弹提示） */
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
    // 兜底拦截：所选支付方式未开通（正常路径已在选择时拦截）
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
      // 将技术性错误（如 PAYMENT_PROVIDER_UNAVAILABLE）映射为友好提示
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

  /** 兜底入口：二维码缺失/扫码失败时手动打开支付页（主路径为弹窗内扫码，不自动跳转） */
  const handleOpenPayUrl = useCallback(() => {
    if (order?.pay_url && order.provider !== "mock") {
      window.open(order.pay_url, "_blank");
    }
  }, [order]);

  /** 支付方式提示文案（i18n，按平台区分；零跳转以扫码提示为主） */
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

  // 仅当二维码为图片 data URL 时渲染 img，防止把非图片地址（路径/协议链接）当图片加载
  const qrImage = order?.qr_code && order.qr_code.startsWith("data:image") ? order.qr_code : null;
  const accentBtnClass = accent === "red" ? "bg-red-600 hover:bg-red-700" : "bg-teal-600 hover:bg-teal-700";

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      closeOnBackdrop={false}
      closeOnEsc={false}
      closeOnDrag={false}
    >
      <div className="space-y-5">
        {/* 金额摘要（套餐/课程信息由各业务注入） */}
        <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">{summaryNode}</div>

        {/* Step: choose */}
        {step === "choose" && (
          <>
            {chooseExtra}

            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">{t("paymentSelectMethod")}</p>
              <div className="space-y-2">
                {providers.map((item) => {
                  const unavailable = Boolean(paymentConfig && !paymentConfig[item.provider]);
                  const selected = provider === item.provider && !unavailable;
                  return (
                    <SelectableCard
                      key={item.provider}
                      selected={selected}
                      disabled={unavailable}
                      onClick={() => handleSelectProvider(item.provider)}
                      className="rounded-2xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{item.icon}</span>
                        <div className="text-start">
                          <div className="font-bold text-slate-800">
                            {item.provider === "alipay" ? t("paymentAlipay") : t("paymentWechat")}
                          </div>
                          <div className="text-xs text-slate-500">{getProviderTip(item.provider)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {unavailable ? (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            {t("paymentDisabledTag")}
                          </span>
                        ) : (
                          item.recommended && (
                            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                              {t("paymentRecommended")}
                            </span>
                          )
                        )}
                      </div>
                    </SelectableCard>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleCreateOrder}
              disabled={isCreating || !canSubmit}
              className={`w-full rounded-2xl py-3.5 text-sm font-black text-white transition-all ${
                isCreating || !canSubmit ? "bg-slate-400" : accentBtnClass
              }`}
            >
              {isCreating ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("paymentCreating")}
                </span>
              ) : (
                `${t("paymentConfirmBtn")} ${currencySymbol}${amount.toFixed(2)}`
              )}
            </button>
          </>
        )}

        {/* Step: waiting（零跳转：弹窗内扫码） */}
        {step === "waiting" && order && (
          <div className="space-y-4 text-center">
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
              <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-amber-600" />
              <p className="text-sm font-bold text-amber-900">{texts?.waitingTitle ?? t("paymentWaitingTitle")}</p>
              <p className="mt-1 text-xs text-amber-700">{texts?.waitingDesc ?? t("paymentWaitingDesc")}</p>
            </div>

            {qrImage ? (
              <div className="mx-auto w-fit rounded-xl border-2 border-slate-200 bg-white p-2">
                {/* NOTE: 保留原生 <img> — qrImage 为 data URL（qrcode 库生成），next/image 不支持 data: 协议 */}
                <img src={qrImage} alt={order.order_no} className="h-48 w-48 object-contain" />
              </div>
            ) : (
              <div className="space-y-2">
                {order.pay_url && order.provider !== "mock" && (
                  <Button
                    type="button"
                    variant="dark"
                    onClick={handleOpenPayUrl}
                    className="w-full rounded-2xl py-3 hover:bg-slate-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t("paymentReOpenBtn")}
                  </Button>
                )}
                {order.provider === "mock" && (
                  <>
                    <p className="text-xs text-slate-500">{texts?.mockNote ?? t("paymentMockNote")}</p>
                    {onMockConfirm && (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleMockConfirm}
                        className="w-full rounded-2xl py-3 font-black"
                      >
                        {t("paymentConfirmBtn")}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}

            <p className="font-mono text-xs text-slate-400">
              {t("paymentOrderNo")}: {order.order_no}
            </p>
          </div>
        )}

        {/* Step: success */}
        {step === "success" && (
          <div className="rounded-2xl border-2 border-teal-300 bg-teal-50 p-5 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-teal-600" />
            <p className="text-lg font-black text-teal-800">{texts?.successTitle ?? t("paymentSuccessTitle")}</p>
            <p className="mt-1 text-sm text-teal-700">{texts?.successDesc ?? t("paymentSuccessDesc")}</p>
            {order && (
              <p className="mt-2 font-mono text-xs text-teal-500">
                {t("paymentOrderNo")}: {order.order_no}
              </p>
            )}
            <Button
              type="button"
              variant="primary"
              onClick={onClose}
              className="mt-4 w-full rounded-2xl py-3 font-black"
            >
              {t("paymentDoneBtn")}
            </Button>
          </div>
        )}

        {/* Step: failed */}
        {step === "failed" && (
          <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 text-center">
            <AlertCircle className="mx-auto mb-3 h-12 w-12 text-rose-600" />
            <p className="text-lg font-black text-rose-800">{texts?.failedTitle ?? t("paymentFailedTitle")}</p>
            <p className="mt-1 text-sm text-rose-700">{error || t("paymentFailedDesc")}</p>
            <Button
              type="button"
              variant="danger"
              onClick={handleRetry}
              className="mt-4 w-full rounded-2xl py-3 font-black"
            >
              {t("paymentRetryBtn")}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

PaymentModalCore.displayName = "PaymentModalCore";
