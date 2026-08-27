/**
 * /services — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Ecosystem Services | Supply OS",
  description: "Explore supply chain related services",
  alternates: {
    canonical: "https://osneosmart.com/services",
    languages: { "x-default": "https://osneosmart.com/services" },
  },
};

export default function ServicesPage() {
  return <PageClient />;
}
