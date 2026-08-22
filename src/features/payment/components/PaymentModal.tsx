/**
 * 会员支付弹窗（统一核心的会员侧薄封装）
 * Membership Payment Modal (thin wrapper over the unified core)
 *
 * @module features/payment/components/PaymentModal
 * @description 支付流程统一收敛至 PaymentModalCore（零跳转弹窗支付）：
 *              本组件仅注入会员业务的下单/查单适配器与套餐摘要卡片，不再持有状态机。
 */

import { useCallback } from "react";
import { useLocale } from "@/core/i18n";
import PaymentModalCore from "./PaymentModalCore";
import { createOrder, getOrderStatus } from "../api";

type PaymentModalProps = {
  planCode: string;
  planName: string;
  amount: number;
  currency: string;
  noticeId?: number | null;
  returnUrl?: string;
  /** 订单类型：'new'（新购，默认）/ 'upgrade'（升级补差） */
  orderType?: "new" | "upgrade";
  /** 升级时的当前套餐 code（服务端校验用） */
  originalPlanCode?: string;
  onClose: () => void;
  onPaymentSuccess: (orderNo: string) => void;
};

export default function PaymentModal({
  planCode,
  planName,
  amount,
  currency,
  noticeId,
  returnUrl,
  orderType,
  originalPlanCode,
  onClose,
  onPaymentSuccess,
}: PaymentModalProps) {
  const { t } = useLocale();
  const currencySymbol = currency === "CNY" ? "¥" : "$";

  // 会员下单适配器：qr_code_url 为服务端渲染的二维码图片（data URL），弹窗内直接扫码
  const handleCreateOrder = useCallback(
    async (provider: "alipay" | "wechat") => {
      const order = await createOrder({
        planCode,
        provider,
        noticeId,
        returnUrl,
        orderType,
        originalPlanCode,
      });
      return {
        order_no: order.order_no,
        provider: order.provider,
        qr_code: order.qr_code_url ?? null,
        pay_url: order.pay_url,
      };
    },
    [planCode, noticeId, returnUrl, orderType, originalPlanCode],
  );

  const handleQueryStatus = useCallback((orderNo: string) => getOrderStatus(orderNo), []);

  return (
    <PaymentModalCore
      onClose={onClose}
      title={t("paymentTitle")}
      amount={amount}
      currency={currency}
      onCreateOrder={handleCreateOrder}
      onQueryStatus={handleQueryStatus}
      onSuccess={onPaymentSuccess}
      summaryNode={
        <>
          <div className="text-sm font-bold text-slate-600">{planName}</div>
          <div className="text-3xl font-black text-slate-900">
            {currencySymbol}
            {amount.toFixed(2)}
          </div>
        </>
      }
    />
  );
}

PaymentModal.displayName = "PaymentModal";
