/**
 * /services — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "服务生态 — 投标/物流/认证服务 | 云境·国际采购平台",
  description: "云境·国际采购平台服务生态：投标辅助、国际物流、产品认证、翻译服务等供应链相关服务，一站式对接专业服务商。",
  openGraph: {
    title: "服务生态 | 云境·国际采购平台",
    description: "投标辅助、国际物流、产品认证等供应链服务一站式对接。",
    type: "website",
  },
  alternates: {
    canonical: absoluteUrl("/services"),
    languages: { "x-default": absoluteUrl("/services") },
  },
};

export default function ServicesPage() {
  return <PageClient />;
}
