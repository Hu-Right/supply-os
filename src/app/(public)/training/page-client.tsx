"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/training").then(m => (m as any).default || m.TrainingLandingPage),
);
