/**
 * 统一支付弹窗 — 步骤展示件（自 PaymentModalCore.tsx 拆出，JSX 逐字不变）。
 *
 * shared 层定位：纯展示，支付状态机全部留在 usePaymentFlow（容器接线）。
 * 全部 React.memo；props 为拆平的原始值/回调（flow 对象整体下传会每次新建、击穿 memo）。
 *
 * @module shared/components/payment-modal/steps
 */
import { memo, type ReactNode } from "react";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button, SelectableCard } from "@/shared/ui";
import type { PaymentModalOrder } from "@/shared/hooks/usePaymentFlow";

/** 支付渠道（与 usePaymentFlow/onCreateOrder 同口径） */
export type PayProvider = "alipay" | "wechat";

export interface ProviderOption {
  provider: PayProvider;
  icon: ReactNode;
  recommended?: boolean;
}

/** choose 步骤：支付方式选择卡 + 错误 + 确认下单按钮 */
export const ChooseStep = memo(function ChooseStep({
  chooseExtra,
  providers,
  provider,
  paymentConfig,
  onSelectProvider,
  providerTip,
  error,
  isCreating,
  canSubmit,
  onCreateOrder,
  accentBtnClass,
  currencySymbol,
  amount,
}: {
  chooseExtra?: ReactNode;
  providers: ProviderOption[];
  provider: PayProvider | null;
  /** 渠道可用性配置（null/undefined 视为可用——与原版 paymentConfig && !cfg[key] 判定一致） */
  paymentConfig: { alipay?: boolean; wechat?: boolean } | null | undefined;
  onSelectProvider: (p: PayProvider) => void;
  providerTip: (p: PayProvider) => string;
  error: string | null;
  isCreating: boolean;
  canSubmit: boolean;
  onCreateOrder: () => void;
  accentBtnClass: string;
  currencySymbol: string;
  amount: number;
}) {
  const { t } = useLocale();
  return (
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
                onClick={() => onSelectProvider(item.provider)}
                className="rounded-2xl flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{item.icon}</span>
                  <div className="text-start">
                    <div className="font-bold text-slate-800">
                      {item.provider === "alipay" ? t("paymentAlipay") : t("paymentWechat")}
                    </div>
                    <div className="text-xs text-slate-500">{providerTip(item.provider)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {unavailable ? (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-2xs font-bold text-slate-500">
                      {t("paymentDisabledTag")}
                    </span>
                  ) : (
                    item.recommended && (
                      <span className="rounded-full bg-amber-400 px-2 py-0.5 text-2xs font-bold uppercase text-amber-900">
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
        onClick={onCreateOrder}
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
  );
});

/** waiting 步骤（零跳转：弹窗内扫码 / mock 手动确认 / 重开收银台） */
export const WaitingStep = memo(function WaitingStep({
  order,
  qrImage,
  texts,
  onMockConfirm,
  handleMockConfirm,
  handleOpenPayUrl,
}: {
  order: PaymentModalOrder;
  qrImage: string | null;
  texts: { waitingTitle?: string; waitingDesc?: string; mockNote?: string };
  /** 传入则 mock 单显示手动确认按钮（原版 onMockConfirm 条件渲染语义） */
  onMockConfirm?: (orderNo: string) => Promise<void>;
  handleMockConfirm: () => void;
  handleOpenPayUrl: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="space-y-4 text-center">
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
        <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-amber-600" />
        <p className="text-sm font-bold text-amber-900">{texts.waitingTitle ?? t("paymentWaitingTitle")}</p>
        <p className="mt-1 text-xs text-amber-700">{texts.waitingDesc ?? t("paymentWaitingDesc")}</p>
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
              <p className="text-xs text-slate-500">{texts.mockNote ?? t("paymentMockNote")}</p>
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
  );
});

/** success 步骤 */
export const SuccessStep = memo(function SuccessStep({
  order,
  texts,
  onClose,
}: {
  order: PaymentModalOrder | null;
  texts: { successTitle?: string; successDesc?: string };
  onClose: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="rounded-2xl border-2 border-teal-300 bg-teal-50 p-5 text-center">
      <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-teal-600" />
      <p className="text-lg font-black text-teal-800">{texts.successTitle ?? t("paymentSuccessTitle")}</p>
      <p className="mt-1 text-sm text-teal-700">{texts.successDesc ?? t("paymentSuccessDesc")}</p>
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
  );
});

/** failed 步骤 */
export const FailedStep = memo(function FailedStep({
  error,
  texts,
  onRetry,
}: {
  error: string | null;
  texts: { failedTitle?: string };
  onRetry: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 text-center">
      <AlertCircle className="mx-auto mb-3 h-12 w-12 text-rose-600" />
      <p className="text-lg font-black text-rose-800">{texts.failedTitle ?? t("paymentFailedTitle")}</p>
      <p className="mt-1 text-sm text-rose-700">{error || t("paymentFailedDesc")}</p>
      <Button
        type="button"
        variant="danger"
        onClick={onRetry}
        className="mt-4 w-full rounded-2xl py-3 font-black"
      >
        {t("paymentRetryBtn")}
      </Button>
    </div>
  );
});
