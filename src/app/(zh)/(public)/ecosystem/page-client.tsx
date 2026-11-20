"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";

const EcosystemPage = dynamic(
  () => import("@/features/ecosystem").then(m => (m as any).default || m.EcosystemPage),
);

export default function PageClient() {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <EcosystemPage />
    </ErrorBoundary>
  );
}
