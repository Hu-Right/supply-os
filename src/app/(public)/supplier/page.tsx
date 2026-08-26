/**
 * /supplier — ISR (revalidate: 1800)
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 1800;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "供应商目录 | Supply OS",
    description: "查找全球认证供应商",
    alternates: {
      canonical: "https://osneosmart.com/supplier",
      languages: { "x-default": "https://osneosmart.com/supplier" },
    },
  };
}

export default function SupplierPage() {
  return <PageClient />;
}
