"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/training").then(m => m.default || m.TrainingLandingPage),
  { ssr: false },
);
