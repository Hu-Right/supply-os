/**
 * /training — ISR (revalidate: 3600)
 *
 * 交互 UI 由 PageClient（dynamic import）在客户端接管。
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Training Camp | Supply OS",
  description: "Professional supply chain training camp: global procurement, supplier management, international trade practices, UN procurement bidding. Hands-on workshops with industry experts.",
  alternates: {
    canonical: absoluteUrl("/training"),
    languages: { "x-default": absoluteUrl("/training") },
  },
};

export default function TrainingPage() {
  return <PageClient />;
}
