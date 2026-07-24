/**
 * 支付订单列表
 * Order history list
 *
 * @module features/payment/components/OrderHistoryList
 * @description 将订单记录映射为 PaymentRecordCard 网格
 *              Maps order records into a grid of PaymentRecordCard
 */

import { useLocale } from "@/core/i18n";
import type { LocaleKey } from "@/core/i18n/types";
import type { BadgeProps } from "@/shared/ui";
import type { OrderRecord } from "../api";
import { PaymentRecordCard } from "./PaymentRecordCard";

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  paid: "success",
  pending: "warning",
  closed: "default",
  failed: "error",
};

const STATUS_LABEL_KEY: Record<string, LocaleKey> = {
  pending: "myPurchasesStatus_pending",
  paid: "myPurchasesStatus_paid",
  closed: "myPurchasesStatus_closed",
  failed: "myPurchasesStatus_failed",
};

function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale);
}

export interface OrderHistoryListProps {
  orders: OrderRecord[];
  onOpenNotice?: (noticeId: number) => void;
}

export function OrderHistoryList({ orders, onOpenNotice }: OrderHistoryListProps) {
  const { t, locale } = useLocale();

  const providerLabel = (provider: OrderRecord["provider"]) => {
    if (provider === "alipay") return t("paymentAlipay");
    if (provider === "wechat") return t("paymentWechat");
    return t("myPurchasesProviderMock");
  };

  const statusLabel = (status: string) => {
    const key = STATUS_LABEL_KEY[status];
    return key ? t(key) : status;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {orders.map((order) => {
        const noticeId = order.notice_id ?? order.notice?.id ?? null;
        const canOpen = !!(onOpenNotice && noticeId && order.status === "paid");
        return (
          <PaymentRecordCard
            key={order.order_no}
            title={order.plan_code}
            statusLabel={statusLabel(order.status)}
            statusVariant={STATUS_VARIANT[order.status] || "default"}
            amountLabel={`${order.currency === "CNY" ? "¥" : "$"}${order.amount}`}
            meta={[
              { label: t("myPurchasesOrderNo"), value: order.order_no },
              { label: t("myPurchasesProvider"), value: providerLabel(order.provider) },
              { label: t("myPurchasesCreatedAt"), value: formatDateTime(order.created_at, locale) },
              { label: t("myPurchasesPaidAt"), value: formatDateTime(order.paid_at, locale) },
            ]}
            noticeTitle={order.notice?.title}
            noticeUrl={order.notice?.url}
            noticeLinkLabel={t("myPurchasesRelatedNotice")}
            onOpenNotice={canOpen ? () => onOpenNotice!(noticeId as number) : undefined}
            openLabel={t("myPurchasesOpenDetail")}
          />
        );
      })}
    </div>
  );
}

OrderHistoryList.displayName = "OrderHistoryList";
