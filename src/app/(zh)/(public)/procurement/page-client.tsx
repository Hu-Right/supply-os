"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";
import type { SearchResultsInitial } from "@/features/procurement/hooks/search/useSearchResults";
import { hydrateCountryNames } from "@/shared/data/countryNames";

const ProcurementPage = dynamic(
  () => import("@/features/procurement").then(m => (m as any).default || m.ProcurementPage),
) as ComponentType<{ initialResults?: SearchResultsInitial }>;

export interface CountryMapsProp {
  countries: Record<string, string>;
  regions: Record<string, string>;
  zhToEn: Record<string, string>;
}

export default function PageClient({
  initialResults,
  countryMaps,
}: {
  initialResults?: SearchResultsInitial;
  countryMaps?: CountryMapsProp;
}) {
  // ★ SSR 快照注入（2026-11-27 水合修复）：必须在子树渲染前执行——服务端渲染与
  // 客户端水合首帧都从这里拿到同一份国家名映射，NoticeCard 的国名才能逐字一致。
  hydrateCountryNames(countryMaps);
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <ProcurementPage initialResults={initialResults} />
    </ErrorBoundary>
  );
}
