"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/showroom").then(m => (m as any).default || m.ShowroomPage),
);
