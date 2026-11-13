"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";

const SupplierPage = dynamic(
  () => import("@/features/supplier").then(m => (m as any).default || m.SupplierPage),
);

export default function PageClient() {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <SupplierPage />
    </ErrorBoundary>
  );
}
