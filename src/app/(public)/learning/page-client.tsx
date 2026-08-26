"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/learning").then(m => (m as any).default || m.LearningPage),
);
