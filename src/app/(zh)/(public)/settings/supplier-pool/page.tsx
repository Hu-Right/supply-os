import type { Metadata } from "next";
import SupplierPoolPageClient from "./page-client";

export const metadata: Metadata = { title: "供应商资源库" };

export default function SupplierPoolPage() {
  return <SupplierPoolPageClient />;
}
