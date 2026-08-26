/**
 * /services — SSG
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "服务 | Supply OS",
    description: "了解供应链相关服务",
    alternates: {
      canonical: "https://osneosmart.com/services",
      languages: { "x-default": "https://osneosmart.com/services" },
    },
  };
}

export default function ServicesPage() {
  return <PageClient />;
}
