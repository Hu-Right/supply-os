/**
 * /learning — SSG
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "学习资源 | Supply OS",
    description: "供应链学习资料与教程",
    alternates: {
      canonical: "https://osneosmart.com/learning",
      languages: { "x-default": "https://osneosmart.com/learning" },
    },
  };
}

export default function LearningPage() {
  return <PageClient />;
}
