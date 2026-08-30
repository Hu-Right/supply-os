/**
 * /membership — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Membership Plans | Supply OS",
  description: "Upgrade membership for premium features",
  alternates: {
    canonical: absoluteUrl("/membership"),
    languages: { "x-default": absoluteUrl("/membership") },
  },
};

export default function MembershipPage() {
  return <PageClient />;
}
