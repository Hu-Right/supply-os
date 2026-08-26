"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/learning").then(m => m.default || m.LearningPage),
  { ssr: false },
);
