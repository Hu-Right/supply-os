"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";

const ProcurementPage = dynamic(
  () => import("@/features/procurement").then(m => (m as any).default || m.ProcurementPage),
);

export default function PageClient() {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <ProcurementPage />
    </ErrorBoundary>
  );
}
