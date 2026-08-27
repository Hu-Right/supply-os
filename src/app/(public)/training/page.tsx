/**
 * /training — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Training Camp | Supply OS",
  description: "Supply chain training course registration",
  alternates: {
    canonical: "https://osneosmart.com/training",
    languages: { "x-default": "https://osneosmart.com/training" },
  },
};

export default function TrainingPage() {
  return <PageClient />;
}
