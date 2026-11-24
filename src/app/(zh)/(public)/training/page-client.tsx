"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";
import type { LandingDataResponse } from "@/features/training/api";

type TrainingLandingProps = { initialData?: LandingDataResponse | null };

const TrainingLandingPage = dynamic(
  () => import("@/features/training").then((m) => m.TrainingLandingPage),
) as ComponentType<TrainingLandingProps>;

export default function PageClient({ initialData }: TrainingLandingProps) {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <TrainingLandingPage initialData={initialData} />
    </ErrorBoundary>
  );
}
