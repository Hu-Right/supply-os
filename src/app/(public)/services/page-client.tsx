"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";

const ServicesPage = dynamic(
  () => import("@/features/services").then(m => (m as any).default || m.ServicesPage),
);

export default function PageClient() {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <ServicesPage />
    </ErrorBoundary>
  );
}
