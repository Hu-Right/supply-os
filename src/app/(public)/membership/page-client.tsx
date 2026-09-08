"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/shared/ui";

const MembershipPage = dynamic(
  () => import("@/features/membership").then(m => (m as any).default || m.MembershipPage),
);

function PageErrorFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-3">
        <p className="text-lg font-bold text-slate-700">页面加载异常</p>
        <p className="text-sm text-slate-500">请刷新页面重试</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700 transition-colors"
        >
          刷新页面
        </button>
      </div>
    </div>
  );
}

export default function PageClient() {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <MembershipPage />
    </ErrorBoundary>
  );
}
