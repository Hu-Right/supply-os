"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/crm").then(m => m.default || m.CrmPage),
  { ssr: false },
);
