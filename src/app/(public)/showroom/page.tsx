/**
 * /showroom — ISR (revalidate: 3600)
 *
 * 交互 UI 由 PageClient（dynamic import）在客户端接管。
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Global Showrooms | Supply OS",
  description: "Browse global supply chain resources and exhibition information across 6 locations: Frankfurt, Dubai, Nairobi, Sao Paulo, Los Angeles, Ho Chi Minh City.",
  alternates: {
    canonical: absoluteUrl("/showroom"),
    languages: { "x-default": absoluteUrl("/showroom") },
  },
};

export default function ShowroomPage() {
  return <PageClient />;
}
