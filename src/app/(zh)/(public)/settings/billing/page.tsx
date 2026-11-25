/**
 * /settings/billing — 费用中心（并入账号中心布局）
 * @module app/(public)/settings/billing/page
 */
import type { Metadata } from "next";
import { BillingCenter } from "@/features/billing/BillingCenter";

export const metadata: Metadata = {
  title: "费用中心",
  description: "订单、账单、发票申请与续费管理。",
  robots: { index: false, follow: false },
};

export default function BillingSettingsPage() {
  return <BillingCenter />;
}
