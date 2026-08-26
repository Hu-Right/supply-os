/**
 * /training — ISR (revalidate: 3600)，全宽布局
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "研修班 | Supply OS",
    description: "供应链研修培训课程报名",
    alternates: {
      canonical: "https://osneosmart.com/training",
      languages: { "x-default": "https://osneosmart.com/training" },
    },
  };
}

export default function TrainingPage() {
  return <PageClient />;
}
