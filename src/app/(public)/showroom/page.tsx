/**
 * /showroom — ISR (revalidate: 3600)
 *
 * 交互 UI 由 PageClient（dynamic import）在客户端接管。
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import { BROWSER_TITLE } from "@/lib/i18n/metadata";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: BROWSER_TITLE.zh,
  description: "云境·国际采购平台海外展厅：法兰克福、迪拜、内罗毕、圣保罗、洛杉矶、胡志明市六大海外永久展示中心，驻外双语顾问 + 24小时前后仓备协同。",
  openGraph: {
    title: BROWSER_TITLE.zh,
    description: "六大海外永久展示中心，驻外双语顾问 + 24小时前后仓备协同，直达国际巨头采购商。",
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
