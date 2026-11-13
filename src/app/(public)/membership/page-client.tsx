"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";
import type { ComparisonView } from "@/types";

const MembershipPage = dynamic(
  () => import("@/features/membership/pages/MembershipPage").then(m => m.default),
);

export default function PageClient({ initialComparison }: { initialComparison?: ComparisonView | null }) {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      {/* 对比矩阵是纯 JSON 视图，RSC 边界直接透传；形态由消费端 useMembershipData 保证 */}
      <MembershipPage initialComparison={initialComparison} />
    </ErrorBoundary>
  );
}
