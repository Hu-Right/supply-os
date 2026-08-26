/**
 * /showroom — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "全球智能展厅 | Supply OS",
    description: "浏览全球优质供应链资源与展会信息",
    alternates: {
      canonical: "https://osneosmart.com/showroom",
      languages: { "x-default": "https://osneosmart.com/showroom" },
    },
  };
}

export default function ShowroomPage() {
  return <PageClient />;
}
