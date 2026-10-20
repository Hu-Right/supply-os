/**
 * /learning — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  // 只写页面名：网站名由根 layout 的 title.template 拼在首位
  title: "学习中心",
  description: "云境·国际采购平台学习中心：国际采购指南、投标技巧、行业报告、UN 采购实务等专业知识库，助力外贸团队能力提升。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "国际采购指南、投标技巧、行业报告等专业知识库。",
    type: "website",
  },
  alternates: {
    canonical: absoluteUrl("/learning"),
    languages: { "x-default": absoluteUrl("/learning") },
  },
};

export default function LearningPage() {
  return <PageClient />;
}
