/**
 * /procurement — SSR（实时搜索数据）
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "采购搜索 | Supply OS",
    description: "搜索全球招标采购信息",
    alternates: {
      canonical: "https://osneosmart.com/procurement",
      languages: { "x-default": "https://osneosmart.com/procurement" },
    },
  };
}

export default function ProcurementPage() {
  return <PageClient />;
}
