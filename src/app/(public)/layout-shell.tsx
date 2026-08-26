"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// Client Components — 动态加载（AppHeader/AppFooter 含大量交互与浏览器 API）
const NetworkBanner = dynamic(() => import("@/shared/layout/NetworkBanner").then(m => m.default || m.NetworkBanner), { ssr: true });
const AppHeader = dynamic(() => import("@/shared/layout/AppHeader").then(m => m.default || m.AppHeader), { ssr: false, loading: () => <div className="h-14" /> });
const AppFooter = dynamic(() => import("@/shared/layout/AppFooter").then(m => m.default || m.AppFooter), { ssr: false });

export default function LayoutShell({ children }: { children: ReactNode }) {
  return (
    <>
      <NetworkBanner />
      <AppHeader
        tabs={[]}
        activeTab=""
        mobileMenuOpen={false}
        setMobileMenuOpen={() => {}}
        onSwitchTab={() => {}}
        onOpenAuth={() => {}}
      />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
      <AppFooter activeTab="" onSwitchTab={() => {}} onOpenConsult={() => {}} />
    </>
  );
}
