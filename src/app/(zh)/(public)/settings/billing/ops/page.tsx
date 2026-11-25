/**
 * /settings/billing/ops — 旧路径兼容：发票处理已迁至运营后台 /ops/invoices
 * @module app/(public)/settings/billing/ops/page
 */
import { redirect } from "next/navigation";

export default function InvoiceOpsLegacyPage() {
  redirect("/ops/invoices");
}
