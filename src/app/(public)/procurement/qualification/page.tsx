/**
 * /procurement/qualification — SSR + 限流
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "供应商资质申请 | Supply OS",
    description: "申请成为认证供应商",
    alternates: {
      canonical: "https://osneosmart.com/procurement/qualification",
      languages: { "x-default": "https://osneosmart.com/procurement/qualification" },
    },
  };
}

export default function QualificationPage() {
  return <PageClient />;
}
