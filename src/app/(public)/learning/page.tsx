/**
 * /learning — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Learning Resources | Supply OS",
  description: "Supply chain learning materials and tutorials",
  alternates: {
    canonical: absoluteUrl("/learning"),
    languages: { "x-default": absoluteUrl("/learning") },
  },
};

export default function LearningPage() {
  return <PageClient />;
}
