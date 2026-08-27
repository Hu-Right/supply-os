/**
 * /procurement — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Procurement Search | Supply OS",
  description: "Search global bidding and procurement information",
  alternates: {
    canonical: "https://osneosmart.com/procurement",
    languages: { "x-default": "https://osneosmart.com/procurement" },
  },
};

export default function ProcurementPage() {
  return <PageClient />;
}
