/**
 * /billing — 旧路径兼容重定向（费用中心已并入账号中心 /settings/billing）
 * @module app/(public)/billing/page
 */
import { redirect } from "next/navigation";

export default function LegacyBillingPage() {
  redirect("/settings/billing");
}
