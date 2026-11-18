import type { Metadata } from "next";

import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "采购方身份认证",
  description: "完善采购主体信息并提交认证，认证通过后可正式发布采购需求。",
};

export default function BuyerVerificationPage() {
  return <PageClient />;
}
