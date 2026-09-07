"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/supplier-profile").then(m => m.SupplierProfilePage),
);
