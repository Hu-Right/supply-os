"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";

const LearningPage = dynamic(
  () => import("@/features/learning").then(m => (m as any).default || m.LearningPage),
);

export default function PageClient() {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <LearningPage />
    </ErrorBoundary>
  );
}
