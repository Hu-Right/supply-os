import type { Metadata } from "next";

import PageClient from "./page-client";

export const metadata: Metadata = {
  // 只写页面名：网站名由根 layout 的 title.template 拼在首位
  title: "编辑采购需求",
  robots: { index: false, follow: false },
};

export default function RfqEditSettingsPage() {
  return <PageClient />;
}
