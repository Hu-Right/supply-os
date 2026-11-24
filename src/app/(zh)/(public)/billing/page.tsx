import type { Metadata } from "next";
import { BillingCenter } from "@/features/billing/BillingCenter";

export const metadata: Metadata = {
  title: "费用中心",
  description: "查看订单、账单、发票申请与续费信息，按已支付订单金额申请开票。",
  robots: { index: false, follow: false },
};

export default function BillingPage() {
  return <BillingCenter />;
}
