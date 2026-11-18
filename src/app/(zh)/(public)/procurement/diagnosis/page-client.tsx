"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";

const DiagnosisFormPage = dynamic(
  () => import("@/features/procurement/pages/DiagnosisFormPage").then((m) => (m as any).default),
  { ssr: false, loading: () => null },
);

export default function PageClient() {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <DiagnosisFormPage />
    </ErrorBoundary>
  );
}
