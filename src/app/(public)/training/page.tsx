/**
 * /training — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import PageClient from "./page-client";
import { getServerI18n } from "@/lib/i18n/server";
import { getPageMetadata } from "@/lib/i18n/metadata";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerI18n();
  const meta = getPageMetadata("training", locale);
  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: "https://osneosmart.com/training",
      languages: { "x-default": "https://osneosmart.com/training" },
    },
  };
}

export default function TrainingPage() {
  return <PageClient />;
}
