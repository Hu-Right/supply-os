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
  title: "履约服务 — 从中标到交付的全链路保障 | 云境·国际采购平台",
  description: "云境·国际采购平台履约服务：合同合规、国际物流、结算保障、持续服务四大阶段全流程支持，助力企业高效完成国际采购履约。",
  openGraph: {
    title: "履约服务 | 云境·国际采购平台",
    description: "从中标到交付的全链路保障，合同合规/国际物流/结算保障/持续服务一站式解决方案。",
    type: "website",
  },
  alternates: {
    canonical: absoluteUrl("/showroom"),
    languages: { "x-default": absoluteUrl("/showroom") },
  },
};

export default function ShowroomPage() {
  return <PageClient />;
}
