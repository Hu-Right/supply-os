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
  title: "全球采购公告搜索 — 联合国/政府采购 | 云境·国际采购平台",
  description: "云境·国际采购平台：搜索联合国机构、各国政府及国际组织的招标与采购公告，支持按国家、行业（UNSPSC）、机构筛选。",
  openGraph: {
    title: "全球采购公告搜索 | 云境·国际采购平台",
    description: "联合国、世界银行、各国政府招标信息一站式搜索，按国家/行业/机构精准筛选。",
    type: "website",
  },
  alternates: {
    canonical: absoluteUrl("/procurement"),
    languages: { "x-default": absoluteUrl("/procurement") },
  },
};

export default function ProcurementPage() {
  return <PageClient />;
}
