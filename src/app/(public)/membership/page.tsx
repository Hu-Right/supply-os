/**
 * /membership — SSR（匿名可见套餐价）
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "会员计划 | Supply OS",
    description: "升级会员获取高级功能",
    alternates: {
      canonical: "https://osneosmart.com/membership",
      languages: { "x-default": "https://osneosmart.com/membership" },
    },
  };
}

export default function MembershipPage() {
  return <PageClient />;
}
