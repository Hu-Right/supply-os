// i18n-allow-file: 供应商企业主页 zh 路由；静态文案由 features/supplier-profile/copy.ts 提供，英文路由见 (en)/en/supplier/[id]
/**
 * /supplier/[id] — 供应商企业主页（SSR，zh）
 *
 * @module app/(zh)/(public)/supplier/[id]
 * @description 服务端直出企业档案：真实工商信息、主营产品、行业定位、资质、成绩单与脱敏联系方式；
 *              空字段整段隐藏（不再渲染 "—" 或按完整度推导的合规结论）。
 *              SEO：真实公司名/行业/地区 title + description + Organization/BreadcrumbList JSON-LD。
 *              交互边界只有「发询盘 / 认领」两个客户端动作。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  loadSupplierProfile,
  loadSupplierScorecard,
  loadSimilarSuppliers,
} from "@/lib/services/supplier-profile-page";
import { SUPPLIER_PROFILE_COPY } from "@/features/supplier-profile/copy";
import { SupplierProfileHeader } from "@/features/supplier-profile/components/SupplierProfileHeader";
import { SupplierProfileBody } from "@/features/supplier-profile/components/SupplierProfileBody";
import { SupplierSimilarSection } from "@/features/supplier-profile/components/SupplierSimilarSection";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { jsonLdScript } from "@/lib/services/seo/json-ld";
import { parseSupplierId } from "@/lib/utils/supplier-id";

export const revalidate = 3600;
const COPY = SUPPLIER_PROFILE_COPY.zh;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dbId = parseSupplierId(id);
  if (!dbId) return { title: "供应商企业主页", robots: { index: false } };
  const data = await loadSupplierProfile(dbId);
  if (!data) return { title: "供应商企业主页", robots: { index: false } };

  const { profile } = data;
  const industry = profile.industry.primary?.nameZh ?? profile.products[0] ?? "供应商";
  const location = [profile.country, profile.province, profile.city].filter(Boolean).join(" · ");
  const title = `${profile.company} — ${industry}`;
  const description = [
    location && `${location}${industry ? ` · ${industry}` : ""}`,
    profile.products.length > 0 && `主营：${profile.products.slice(0, 4).join("、")}`,
    profile.certifications.length > 0 && `认证：${profile.certifications.join("、")}`,
    "供应商企业档案：工商信息、主营产品、资质认证与联系方式。",
  ]
    .filter(Boolean)
    .join("；");

  return {
    title,
    description,
    alternates: {
      canonical: absoluteUrl(`/supplier/${dbId}`),
      languages: {
        zh: absoluteUrl(`/supplier/${dbId}`),
        en: absoluteUrl(`/en/supplier/${dbId}`),
        "x-default": absoluteUrl(`/supplier/${dbId}`),
      },
    },
    openGraph: {
      title: `${profile.company} | 供应商企业主页`,
      description,
      url: absoluteUrl(`/supplier/${dbId}`),
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_OG_IMAGE.url],
    },
  };
}

export default async function SupplierProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dbId = parseSupplierId(id);
  if (!dbId) notFound();

  const data = await loadSupplierProfile(dbId);
  if (!data) notFound();
  const { profile, claimed } = data;
  const [scorecard, similar] = await Promise.all([
    loadSupplierScorecard(dbId),
    loadSimilarSuppliers(profile),
  ]);

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: profile.company,
    url: absoluteUrl(`/supplier/${dbId}`),
    description: profile.products.length > 0 ? `主营：${profile.products.slice(0, 8).join("、")}` : undefined,
    address:
      profile.country || profile.province || profile.city
        ? {
            "@type": "PostalAddress",
            addressLocality: profile.city || undefined,
            addressRegion: profile.province || undefined,
            addressCountry: profile.country || undefined,
            streetAddress: profile.address || undefined,
          }
        : undefined,
    sameAs: profile.website ?? undefined,
    foundingDate: profile.establishedAt ?? undefined,
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: COPY.breadcrumbHome, item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: COPY.breadcrumbDirectory, item: absoluteUrl("/supplier") },
      { "@type": "ListItem", position: 3, name: profile.company, item: absoluteUrl(`/supplier/${dbId}`) },
    ],
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }} />

      <nav aria-label="面包屑" className="mb-4 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <Link href="/" className="hover:text-teal-700">{COPY.breadcrumbHome}</Link>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <Link href="/supplier" className="hover:text-teal-700">{COPY.breadcrumbDirectory}</Link>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <span className="truncate font-semibold text-slate-700" aria-current="page">{profile.company}</span>
      </nav>

      <div className="space-y-5">
        <SupplierProfileHeader profile={profile} claimed={claimed} copy={COPY} locale="zh" />
        <SupplierProfileBody
          profile={profile}
          claimed={claimed}
          scorecard={scorecard}
          copy={COPY}
          locale="zh"
        />
        <SupplierSimilarSection items={similar} copy={COPY} locale="zh" />
      </div>
    </div>
  );
}
