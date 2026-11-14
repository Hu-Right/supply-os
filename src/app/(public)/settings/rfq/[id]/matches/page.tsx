import type { Metadata } from "next";

import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "已匹配供应商",
  description: "查看该采购需求的规则匹配候选供应商名单。",
};

export default function RfqMatchesPage() {
  return <PageClient />;
}
