import type { Metadata } from "next";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "受邀需求",
  description: "平台定向邀约给你的采购需求",
  robots: { index: false, follow: false },
};

export default function RfqInvitesPage() {
  return <PageClient />;
}
