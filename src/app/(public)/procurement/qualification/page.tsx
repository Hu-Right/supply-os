/**
 * /procurement/qualification — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Supplier Qualification | Supply OS",
  description: "Apply to become a certified supplier",
  alternates: {
    canonical: "https://osneosmart.com/procurement/qualification",
    languages: { "x-default": "https://osneosmart.com/procurement/qualification" },
  },
};

export default function QualificationPage() {
  return <PageClient />;
}
