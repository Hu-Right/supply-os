/**
 * /procurement — ISR (revalidate: 3600)
 *
 * 交互搜索层由客户端接管（PageClient）。
 */
import type { Metadata } from "next";
import PageClient from "./page-client";
import { absoluteUrl } from "@/lib/services/seo/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Procurement Search | Supply OS",
  description: "Search global bidding and procurement notices from UN agencies, governments, and international organizations. Filter by country, industry (UNSPSC), and institution.",
  alternates: {
    canonical: absoluteUrl("/procurement"),
    languages: { "x-default": absoluteUrl("/procurement") },
  },
};

export default function ProcurementPage() {
  return <PageClient />;
}
