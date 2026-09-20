import type { Metadata } from "next";

import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "编辑采购需求 | 账户设置",
  robots: { index: false, follow: false },
};

export default function RfqEditSettingsPage() {
  return <PageClient />;
}
