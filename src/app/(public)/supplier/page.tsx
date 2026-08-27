/**
 * /supplier — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Supplier Directory | Supply OS",
  description: "Find certified suppliers worldwide",
  alternates: {
    canonical: "https://osneosmart.com/supplier",
    languages: { "x-default": "https://osneosmart.com/supplier" },
  },
};

export default function SupplierPage() {
  return <PageClient />;
}
