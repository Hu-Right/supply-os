"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";

const TrainingLandingPage = dynamic(
  () => import("@/features/training").then(m => (m as any).default || m.TrainingLandingPage),
);

export default function PageClient() {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <TrainingLandingPage />
    </ErrorBoundary>
  );
}
