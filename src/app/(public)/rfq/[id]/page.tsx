import type { Metadata } from "next";

import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "采购需求详情",
  description: "查看平台采购需求详情，包含需求描述、商务条款与报价截止时间。",
};

export default function RfqDetailPage() {
  return <PageClient />;
}
