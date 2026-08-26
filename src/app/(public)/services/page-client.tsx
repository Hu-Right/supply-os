"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/services").then(m => m.default || m.ServicesPage),
  { ssr: false },
);
