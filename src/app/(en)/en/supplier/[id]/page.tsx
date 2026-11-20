/**
 * /en/supplier/[id] — Supplier profile (SSR, English)
 *
 * @module app/(en)/en/supplier/[id]
 * @description English mirror of the zh supplier profile route: same server-side data view,
 *              English copy from features/supplier-profile/copy.ts, English metadata + canonical
 *              /en/supplier/[id], hreflang alternates to the zh route, Organization/Breadcrumb JSON-LD.
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
const COPY = SUPPLIER_PROFILE_COPY.en;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dbId = parseSupplierId(id);
  if (!dbId) return { title: "Supplier Profile", robots: { index: false } };
  const data = await loadSupplierProfile(dbId);
  if (!data) return { title: "Supplier Profile", robots: { index: false } };

  const { profile } = data;
  const industry = profile.industry.primary?.nameEn ?? profile.products[0] ?? "supplier";
  const location = [profile.supplier.countryEn, profile.province, profile.city].filter(Boolean).join(" · ");
  const title = `${profile.company} — ${industry}`;
  const description = [
    location && `${location}${industry ? ` · ${industry}` : ""}`,
    profile.products.length > 0 && `Main products: ${profile.products.slice(0, 4).join(", ")}`,
    profile.certifications.length > 0 && `Certifications: ${profile.certifications.join(", ")}`,
    "Supplier profile with company facts, products, certifications and contact options.",
  ]
    .filter(Boolean)
    .join("; ");

  return {
    title,
    description,
    alternates: {
      canonical: absoluteUrl(`/en/supplier/${dbId}`),
      languages: {
        en: absoluteUrl(`/en/supplier/${dbId}`),
        zh: absoluteUrl(`/supplier/${dbId}`),
        "x-default": absoluteUrl(`/supplier/${dbId}`),
      },
    },
    openGraph: {
      title: `${profile.company} | Supplier Profile`,
      description,
      url: absoluteUrl(`/en/supplier/${dbId}`),
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

export default async function SupplierProfilePageEn({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dbId = parseSupplierId(id);
  if (!dbId) notFound();

  // 成绩单只依赖 dbId，与档案取数并行；相似供应商依赖 profile，必须等档案就绪
  const [data, scorecard] = await Promise.all([
    loadSupplierProfile(dbId),
    loadSupplierScorecard(dbId),
  ]);
  if (!data) notFound();
  const { profile, claimed } = data;
  const similar = await loadSimilarSuppliers(profile);

  const countryForSchema = profile.supplier.countryEn || profile.country;
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: profile.company,
    url: absoluteUrl(`/en/supplier/${dbId}`),
    description: profile.products.length > 0 ? `Main products: ${profile.products.slice(0, 8).join(", ")}` : undefined,
    address:
      countryForSchema || profile.province || profile.city
        ? {
            "@type": "PostalAddress",
            addressLocality: profile.city || undefined,
            addressRegion: profile.province || undefined,
            addressCountry: countryForSchema || undefined,
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
      { "@type": "ListItem", position: 1, name: COPY.breadcrumbHome, item: absoluteUrl("/en") },
      { "@type": "ListItem", position: 2, name: COPY.breadcrumbDirectory, item: absoluteUrl("/en/supplier") },
      { "@type": "ListItem", position: 3, name: profile.company, item: absoluteUrl(`/en/supplier/${dbId}`) },
    ],
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }} />

      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <Link href="/en" className="hover:text-teal-700">{COPY.breadcrumbHome}</Link>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <span className="font-semibold text-slate-600">{COPY.breadcrumbDirectory}</span>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <span className="truncate font-semibold text-slate-700" aria-current="page">{profile.company}</span>
      </nav>

      <div className="space-y-5">
        <SupplierProfileHeader profile={profile} claimed={claimed} copy={COPY} locale="en" />
        <SupplierProfileBody
          profile={profile}
          scorecard={scorecard}
          copy={COPY}
          locale="en"
        />
        <SupplierSimilarSection items={similar} copy={COPY} locale="en" />
      </div>
    </div>
  );
}
