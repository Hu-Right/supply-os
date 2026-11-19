// i18n-allow-file: 供应商企业主页首版为 zh 路由服务端渲染（英文站点尚无供应商详情路由），
// 页面与 generateMetadata 统一中文口径；接入 /en/supplier/[id] 时再按 locale 拆键。
/**
 * /supplier/[id] — 供应商企业主页（SSR 首版）
 *
 * @module app/(zh)/(public)/supplier/[id]
 * @description 服务端直出企业档案：真实工商信息、主营产品、行业定位、资质、成绩单与脱敏联系方式；
 *              空字段整段隐藏（不再渲染 "—" 或按完整度推导的合规结论）。
 *              SEO：真实公司名/行业/地区 title + description + Organization/BreadcrumbList JSON-LD。
 *              交互边界只有「发询盘 / 认领」两个客户端动作（SupplierProfileActions）。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import { ChevronRight } from "lucide-react";
import { getContext } from "@/lib/db/context";
import { getPool } from "@/lib/db/pool";
import { SupplierDiagnosisRepo } from "@/lib/repos/supplier-diagnosis.repo";
import { supplierScorecardViewOf } from "@/lib/services/supplier-diagnosis/scorecard-view";
import { loadCountryAliasSnapshot } from "@/lib/services/country/alias-store";
import { loadSupplierIndustryInfo } from "@/lib/services/industry-labels";
import { supplierProfileViewOf } from "@/lib/services/supplier-profile";
import { SupplierProfileHeader } from "@/features/supplier-profile/components/SupplierProfileHeader";
import { SupplierProfileBody } from "@/features/supplier-profile/components/SupplierProfileBody";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { jsonLdScript } from "@/lib/services/seo/json-ld";
import { parseSupplierId } from "@/lib/utils/supplier-id";

export const revalidate = 3600;

/** 同一请求内 generateMetadata 与页面共用一次取数 */
const loadSupplierProfile = cache(async (dbId: number) => {
  const ctx = getContext();
  // 公开面只认 info_review_status='reviewed'（与列表口径一致）；本人绑定主体查看待审档案走 /api 路径
  const row = await ctx.supplier.directoryRepo.findByIdWithFallback(dbId);
  if (!row) return null;

  let industry = null;
  try {
    const info = await loadSupplierIndustryInfo(ctx.supplier.industryRepo, [row]);
    industry = info.get(dbId) ?? null;
  } catch (err) {
    console.error("[supplier/[id]] 行业标签装配失败，本次退回产品首项:", err);
  }
  let snap;
  try {
    snap = await loadCountryAliasSnapshot(ctx.dbPool);
  } catch (err) {
    console.error("[supplier/[id]] 国家别名快照加载失败，本次退回原文:", err);
  }

  let claimed = false;
  try {
    claimed = await ctx.supplier.directoryRepo.isClaimed(dbId);
  } catch {
    // 认领状态查询失败不影响主内容
  }
  return { profile: supplierProfileViewOf(row, industry, snap), claimed };
});

async function loadScorecard(dbId: number) {
  try {
    const row = await new SupplierDiagnosisRepo(getPool()).findClaimantScorecard(dbId);
    return row ? supplierScorecardViewOf(row, "zh") : null;
  } catch (err) {
    console.error("[supplier/[id]] 成绩单装配失败，本次不渲染:", err);
    return null;
  }
}

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
    alternates: { canonical: absoluteUrl(`/supplier/${dbId}`) },
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
  const scorecard = await loadScorecard(dbId);

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
      { "@type": "ListItem", position: 1, name: "首页", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "供应商目录", item: absoluteUrl("/supplier") },
      { "@type": "ListItem", position: 3, name: profile.company, item: absoluteUrl(`/supplier/${dbId}`) },
    ],
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }} />

      <nav aria-label="面包屑" className="mb-4 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <Link href="/" className="hover:text-teal-700">首页</Link>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <Link href="/supplier" className="hover:text-teal-700">供应商目录</Link>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <span className="truncate font-semibold text-slate-700" aria-current="page">{profile.company}</span>
      </nav>

      <div className="space-y-5">
        <SupplierProfileHeader profile={profile} claimed={claimed} />
        <SupplierProfileBody profile={profile} claimed={claimed} scorecard={scorecard} />
      </div>
    </div>
  );
}
