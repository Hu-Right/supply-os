import type { Metadata } from "next";
import KeywordLibraryPageClient from "./page-client";

export const metadata: Metadata = { title: "产品关键词库" };

export default function KeywordLibraryPage() {
  return <KeywordLibraryPageClient />;
}
