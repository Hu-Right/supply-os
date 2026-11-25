/**
 * /settings/billing/ops — 财务发票处理（白名单账号）
 * @module app/(public)/settings/billing/ops/page
 */
import type { Metadata } from "next";
import { InvoiceOpsPanel } from "@/features/billing/InvoiceOpsPanel";

export const metadata: Metadata = {
  title: "发票处理",
  robots: { index: false, follow: false },
};

export default function InvoiceOpsPage() {
  return <InvoiceOpsPanel />;
}
