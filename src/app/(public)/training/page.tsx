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
  title: "国际公共采购研修班 — 实战培训 | 云境·国际采购平台",
  description: "云境·国际采购平台研修班：国际公共采购实战培训，联合国采购流程、投标技巧、供应商管理，行业专家手把手教学。",
  openGraph: {
    title: "国际公共采购研修班 | 云境·国际采购平台",
    description: "联合国采购实战培训，行业专家手把手教学，助力企业掌握国际投标技能。",
    type: "website",
  },
  alternates: {
    canonical: absoluteUrl("/training"),
    languages: { "x-default": absoluteUrl("/training") },
  },
};

export default function TrainingPage() {
  return <PageClient />;
}
