"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/supplier").then(m => (m as any).default || m.SupplierPage),
);
