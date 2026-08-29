/**
 * /supplier — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Supplier Directory | Supply OS",
  description: "Find certified suppliers worldwide",
  alternates: {
    canonical: absoluteUrl("/supplier"),
    languages: { "x-default": absoluteUrl("/supplier") },
  },
};

export default function SupplierPage() {
  return <PageClient />;
}
