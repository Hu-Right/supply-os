"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/membership").then(m => m.default || m.MembershipPage),
  { ssr: false },
);
