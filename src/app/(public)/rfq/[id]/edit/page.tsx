import type { Metadata } from "next";

import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "编辑采购需求",
};

export default function RfqEditPage() {
  return <PageClient />;
}
