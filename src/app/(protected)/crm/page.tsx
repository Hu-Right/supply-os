/**
 * /crm — protected page
 */
import type { Metadata } from "next";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "CRM Client Management | Supply OS",
  description: "Manage your customer relationships and sales leads",
  alternates: {
    canonical: "https://osneosmart.com/crm",
    languages: { "x-default": "https://osneosmart.com/crm" },
  },
};

export default function CrmPage() {
  return <PageClient />;
}
