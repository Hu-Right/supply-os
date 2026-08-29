/**
 * /procurement/qualification — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Supplier Qualification | Supply OS",
  description: "Apply to become a certified supplier",
  alternates: {
    canonical: absoluteUrl("/procurement/qualification"),
    languages: { "x-default": absoluteUrl("/procurement/qualification") },
  },
};

export default function QualificationPage() {
  return <PageClient />;
}
