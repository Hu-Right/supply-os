"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/procurement/pages/QualificationFormPage").then(m => (m as any).default),
);
