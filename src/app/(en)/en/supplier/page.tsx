/**
 * /en/supplier — English supplier directory (server-rendered first page)
 */
import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../../shell";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { listSupplierDirectoryPage } from "@/lib/services/suppliers-directory";

export const metadata: Metadata = {
  title: "Supplier directory",
  description:
    "Browse verified Chinese and international suppliers by products, industry and country. Open a supplier profile to see capabilities and contact options.",
  alternates: {
    canonical: absoluteUrl("/en/supplier"),
    languages: {
      en: absoluteUrl("/en/supplier"),
      "zh-CN": absoluteUrl("/supplier"),
      "x-default": absoluteUrl("/supplier"),
    },
  },
  openGraph: {
    title: "Supplier directory | Yunjing",
    description: "Find verified suppliers for international procurement.",
    url: absoluteUrl("/en/supplier"),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

const PAGE_SIZE = 12;

export default async function EnglishSupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  let items: Awaited<ReturnType<typeof listSupplierDirectoryPage>>["items"] = [];
  let total = 0;
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    try {
      const result = await listSupplierDirectoryPage({ page, pageSize: PAGE_SIZE });
      items = result.items;
      total = result.total;
    } catch (err) {
      console.error("[en/supplier] 列表加载失败:", (err as Error).message);
    }
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <EnglishShell>
      <header className="space-y-3 py-6">
        <p className="text-xs font-bold uppercase tracking-widest text-training-green">Suppliers</p>
        <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">Supplier directory</h1>
        <p className="max-w-3xl text-base leading-relaxed text-slate-600">
          Browse verified suppliers by products, industry and country. Open a profile to see capabilities,
          certifications and contact options.
        </p>
        <p className="text-sm text-slate-500">{total.toLocaleString("en-US")} suppliers on file</p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          The directory is temporarily unavailable. Please try again later.
        </p>
      ) : (
        <section className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => {
            const name = s.nameEn || s.nameZh || `Supplier #${s.id}`;
            const products = s.mainProductsEn || s.mainProductsZh || "";
            const country = s.countryEn || s.countryZh || "";
            const industry = s.industryEn || s.industryZh || "";
            return (
              <Link
                key={s.id}
                href={`/en/supplier/${s.id}`}
                className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-training-green/40"
              >
                <h2 className="text-sm font-bold leading-snug text-slate-900">{name}</h2>
                {industry ? <p className="mt-1 text-xs font-semibold text-training-green">{industry}</p> : null}
                {products ? <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600">{products}</p> : null}
                <p className="mt-auto pt-3 text-xs text-slate-400">{country}</p>
              </Link>
            );
          })}
        </section>
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-between py-4 text-sm">
          {page > 1 ? (
            <Link href={`/en/supplier?page=${page - 1}`} className="font-bold text-training-green hover:underline">
              ← Previous
            </Link>
          ) : <span />}
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`/en/supplier?page=${page + 1}`} className="font-bold text-training-green hover:underline">
              Next →
            </Link>
          ) : <span />}
        </nav>
      ) : null}
    </EnglishShell>
  );
}
