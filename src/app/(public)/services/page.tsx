/**
 * /services — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Ecosystem Services | Supply OS",
  description: "Explore supply chain related services",
  alternates: {
    canonical: absoluteUrl("/services"),
    languages: { "x-default": absoluteUrl("/services") },
  },
};

export default function ServicesPage() {
  return <PageClient />;
}
