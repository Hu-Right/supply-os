"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/showroom").then(m => m.default || m.ShowroomPage),
  { ssr: false },
);
