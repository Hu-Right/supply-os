// i18n-allow-file: 运营后台·发票处理（内部页面，仅白名单账号）
/**
 * /ops/invoices — 运营后台发票处理模块
 */
import type { Metadata } from "next";
import { InvoiceOpsPanel } from "@/features/billing/InvoiceOpsPanel";

export const metadata: Metadata = {
  title: "发票处理",
  robots: { index: false, follow: false, nocache: true },
};

export default function OpsInvoicesPage() {
  return <InvoiceOpsPanel />;
}
