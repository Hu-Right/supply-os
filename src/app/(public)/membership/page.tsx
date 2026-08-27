/**
 * /membership — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Membership Plans | Supply OS",
  description: "Upgrade membership for premium features",
  alternates: {
    canonical: "https://osneosmart.com/membership",
    languages: { "x-default": "https://osneosmart.com/membership" },
  },
};

export default function MembershipPage() {
  return <PageClient />;
}
