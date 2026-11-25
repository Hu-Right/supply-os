"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { Supplier } from "@/types";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";

const SupplierPage = dynamic(
  () => import("@/features/supplier").then(m => (m as any).default || m.SupplierPage),
) as ComponentType<{ initial?: { suppliers: Supplier[]; total: number } }>;

export default function PageClient({ initial }: { initial?: { suppliers: Supplier[]; total: number } }) {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <SupplierPage initial={initial} />
    </ErrorBoundary>
  );
}
