/**
 * /showroom — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Global Showrooms | Supply OS",
  description: "Browse global supply chain resources and exhibition information",
  alternates: {
    canonical: "https://osneosmart.com/showroom",
    languages: { "x-default": "https://osneosmart.com/showroom" },
  },
};

export default function ShowroomPage() {
  return <PageClient />;
}
