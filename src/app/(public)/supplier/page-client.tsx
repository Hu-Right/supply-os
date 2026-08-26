"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/supplier").then(m => m.default || m.SupplierPage),
  { ssr: false },
);
