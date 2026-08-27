/**
 * /learning — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Learning Resources | Supply OS",
  description: "Supply chain learning materials and tutorials",
  alternates: {
    canonical: "https://osneosmart.com/learning",
    languages: { "x-default": "https://osneosmart.com/learning" },
  },
};

export default function LearningPage() {
  return <PageClient />;
}
