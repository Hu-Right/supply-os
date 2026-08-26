"use client";

import dynamic from "next/dynamic";

export default dynamic(
  () => import("@/features/membership").then(m => (m as any).default || m.MembershipPage),
);
