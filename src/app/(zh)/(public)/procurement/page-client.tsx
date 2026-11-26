"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";
import type { SearchResultsInitial } from "@/features/procurement/hooks/search/useSearchResults";
import type { CountrySummary } from "@/lib/services/seo/country-summary";

const ProcurementPage = dynamic(
  () => import("@/features/procurement").then(m => (m as any).default || m.ProcurementPage),
) as ComponentType<{ initialResults?: SearchResultsInitial; countrySummary?: CountrySummary | null }>;

export default function PageClient({
  initialResults,
  countrySummary,
}: {
  initialResults?: SearchResultsInitial;
  countrySummary?: CountrySummary | null;
}) {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <ProcurementPage initialResults={initialResults} countrySummary={countrySummary} />
    </ErrorBoundary>
  );
}
