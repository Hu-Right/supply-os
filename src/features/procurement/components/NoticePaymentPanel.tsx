/**
 * 采购公告内嵌多套餐付费面板
 * Notice-embedded Multi-plan Payment Panel
 *
 * @module features/procurement/components/NoticePaymentPanel
 * @description 远端 PaymentPanel 的模块化版本：支付方式切换（支付宝可用 / 微信禁用）、
 *              逐条渲染套餐价格与购买按钮、订单创建后展示 mock/真实支付入口。
 *              Modular version of the remote PaymentPanel: provider switch,
 *              per-plan pricing and purchase, mock/real payment entry after order.
 */

import { CheckCircle2, CreditCard, ExternalLink, X } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { MembershipPlan, PaymentOrder } from "../types";

interface NoticePaymentPanelProps {
  plans: MembershipPlan[];
  provider: "alipay" | "wechat";
  order: PaymentOrder | null;
  busyPlanCode: string;
  message: string;
  onProviderChange: (provider: "alipay" | "wechat") => void;
  onCreateOrder: (planCode: string) => void;
  onMockPaid: () => void;
  onClose: () => void;
}

/** 金额格式化：CNY 用 ¥，其余用 $ */
function formatMoney(price: number, currency?: string): string {
  const symbol = currency === "CNY" || !currency ? "¥" : "$";
  return `${symbol}${Number(price || 0).toLocaleString()}`;
}

export function NoticePaymentPanel({
  plans,
  provider,
  order,
  busyPlanCode,
  message,
  onProviderChange,
  onCreateOrder,
  onMockPaid,
  onClose,
}: NoticePaymentPanelProps) {
  const { t } = useLocale();

  return (
    <section className="border border-slate-200 rounded-xl bg-white p-4 shadow-lg space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-extrabold text-slate-900">{t("procurement_products")}</h4>
          <p className="text-[11px] text-slate-500 mt-1 leading-5">{t("procurement_productsDesc")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("procurement_close")}
          title={t("procurement_close")}
          className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {(message || busyPlanCode) && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-800">
          {busyPlanCode ? t("procurement_creatingOrder") : message}
        </div>
      )}

      {order && (
        <div className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900">
          <p className="font-black flex items-center gap-2 break-all">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {t("procurement_orderNo")}: {order.order_no}
          </p>
          <p className="text-xs mt-1 leading-5">
            {order.payment_mode === "configured" ? t("procurement_orderCreated") : t("procurement_mockNote")}
          </p>
          {order.payment_mode !== "configured" && (
            <button
              onClick={onMockPaid}
              className="mt-3 px-3 py-2 rounded-lg bg-teal-700 text-white text-xs font-black hover:bg-teal-800"
            >
              {t("procurement_mockPaid")}
            </button>
          )}
          {order.pay_url && order.payment_mode === "configured" && (
            <button
              type="button"
              onClick={() => window.open(order.pay_url, "_blank")}
              className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-700 text-white text-xs font-black hover:bg-blue-800"
            >
              <ExternalLink className="w-4 h-4" />
              {t("procurement_choosePay")}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {(["alipay", "wechat"] as const).map((item) => {
          const disabled = item === "wechat";
          return (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (!disabled) onProviderChange(item);
              }}
              className={`px-3 py-2 rounded-lg border text-xs font-black ${
                disabled
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : provider === item
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {item === "alipay" ? t("procurement_alipay") : `${t("procurement_wechat")}${t("procurement_wechatDisabled")}`}
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5">
        {plans.map((plan) => (
          <div
            key={plan.plan_code}
            className={`border rounded-lg p-3 bg-slate-50 ${
              order?.plan_code === plan.plan_code ? "border-teal-300 ring-1 ring-teal-100" : "border-slate-200"
            }`}
          >
            <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-900">{plan.name}</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-5">{plan.description}</p>
              </div>
              <p className="text-xl font-black text-blue-700 leading-none whitespace-nowrap">
                {formatMoney(plan.price, plan.currency)}
              </p>
            </div>
            <button
              type="button"
              disabled={busyPlanCode === plan.plan_code}
              onClick={() => onCreateOrder(plan.plan_code)}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-black hover:bg-blue-700 disabled:opacity-60"
            >
              <CreditCard className="w-4 h-4" />
              {busyPlanCode === plan.plan_code
                ? t("procurement_creatingOrder")
                : order?.plan_code === plan.plan_code
                  ? t("procurement_orderNo")
                  : t("procurement_choosePay")}
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
        {t("procurement_paymentTip")}
      </div>
    </section>
  );
}
