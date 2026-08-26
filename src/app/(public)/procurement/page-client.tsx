"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/procurement").then(m => m.default || m.ProcurementPage),
  { ssr: false },
);
