/**
 * /crm — protected page
 */
import type { Metadata } from "next";
import PageClient from "./page-client";
import { getServerI18n } from "@/lib/i18n/server";
import { getPageMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerI18n();
  const meta = getPageMetadata("crm", locale);
  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: "https://osneosmart.com/crm",
      languages: { "x-default": "https://osneosmart.com/crm" },
    },
  };
}

export default function CrmPage() {
  return <PageClient />;
}
