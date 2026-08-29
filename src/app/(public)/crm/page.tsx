/**
 * /crm — public page (open to all users)
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "CRM Client Management | Supply OS",
  description: "Manage your customer relationships and sales leads",
  alternates: {
    canonical: absoluteUrl("/crm"),
    languages: { "x-default": absoluteUrl("/crm") },
  },
};

export default function CrmPage() {
  return <PageClient />;
}
