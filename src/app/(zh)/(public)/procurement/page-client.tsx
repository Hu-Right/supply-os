"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";
import type { SearchResultsInitial } from "@/features/procurement/hooks/search/useSearchResults";

const ProcurementPage = dynamic(
  () => import("@/features/procurement").then(m => (m as any).default || m.ProcurementPage),
) as ComponentType<{ initialResults?: SearchResultsInitial }>;

export default function PageClient({
  initialResults,
}: {
  initialResults?: SearchResultsInitial;
}) {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <ProcurementPage initialResults={initialResults} />
    </ErrorBoundary>
  );
}
