/**
 * /procurement/diagnosis — 供应商投标能力诊断 v2（ISR revalidate: 3600）
 *
 * @description 表单本体是纯客户端组件（登录守卫 + 19 题 + 结果报告），
 *              服务端只出静态外壳与 SEO 元信息。
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: BROWSER_TITLE.zh,
  description: "云境·国际采购平台供应商投标能力诊断：10 个维度评估国际公共采购就绪度，出具等级与能力缺口清单。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "10 维度投标能力诊断，出具就绪等级与能力缺口清单。",
    type: "website",
  },
  alternates: {
    canonical: absoluteUrl("/procurement/diagnosis"),
    languages: { "x-default": absoluteUrl("/procurement/diagnosis") },
  },
  robots: { index: false, follow: false },
};

export default function DiagnosisPage() {
  return <PageClient />;
}
