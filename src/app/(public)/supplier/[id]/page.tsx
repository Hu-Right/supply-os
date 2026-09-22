/**
 * /supplier/[id] — 供应商企业主页
 * Supplier Enterprise Profile Page
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PageClient from "./page-client";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `供应商企业主页 #${id} | 云境·国际采购平台`,
    description: "供应商企业能力档案，包含企业规模、产品目录、资质证书、国际公采适配等信息。",
    openGraph: { title: `Supplier Profile #${id}`, type: "website" },
    alternates: { canonical: absoluteUrl(`/supplier/${id}`) },
  };
}

export default function SupplierProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return <PageClient />;
}
