/**
 * /en/about — About Yunjing (English entity page)
 */
import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../../shell";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { jsonLdScript } from "@/lib/services/seo/json-ld";

export const revalidate = 3600;

const COMPANY = {
  legalName: "Hangzhou Yunjing Zhizhan Technology Co., Ltd.",
  nameZh: "杭州云境智展科技有限公司",
  taxID: "91330110MAEQC7N58T",
  address:
    "Room 101-102, Building 9, No. 2 Tongshanxi Road, Zhongtai Street, Yuhang District, Hangzhou, Zhejiang, China",
  phone: "+86 13857143215",
  email: "632236300@qq.com",
  foundingDate: "2025-07-31",
  sameAs: "https://www.tianyancha.com/company/7657586399",
};

export const metadata: Metadata = {
  title: "About Yunjing",
  description:
    "Yunjing is a procurement intelligence platform helping Chinese suppliers find and win UN, World Bank and government tenders. Learn who we are, what we cover and how to contact us.",
  alternates: {
    canonical: absoluteUrl("/en/about"),
    languages: {
      en: absoluteUrl("/en/about"),
      "zh-CN": absoluteUrl("/about"),
      "x-default": absoluteUrl("/about"),
    },
  },
  openGraph: {
    title: "About Yunjing",
    description: "Procurement intelligence for Chinese suppliers going global.",
    url: absoluteUrl("/en/about"),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

const stats = [
  { value: "375,000+", label: "Active notices" },
  { value: "189", label: "Countries and regions" },
  { value: "685+", label: "Verified suppliers" },
];

export default function EnglishAboutPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${absoluteUrl("/en")}#organization`,
    name: "Yunjing International Procurement Platform",
    legalName: COMPANY.legalName,
    alternateName: ["云境·国际采购平台", COMPANY.nameZh],
    url: absoluteUrl("/en"),
    logo: absoluteUrl("/logo.png"),
    description:
      "Procurement intelligence platform for UN, World Bank and government tender notices, supplier discovery and bid enablement.",
    foundingDate: COMPANY.foundingDate,
    taxID: COMPANY.taxID,
    address: {
      "@type": "PostalAddress",
      streetAddress: COMPANY.address,
      addressCountry: "CN",
    },
    telephone: COMPANY.phone,
    email: COMPANY.email,
    sameAs: [COMPANY.sameAs],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: COMPANY.phone,
      email: COMPANY.email,
      availableLanguage: ["en", "zh"],
    },
  };

  return (
    <EnglishShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <header className="space-y-3 py-6">
        <p className="text-xs font-bold uppercase tracking-widest text-training-green">About us</p>
        <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
          Procurement intelligence for suppliers going global
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-slate-600">
          Yunjing is operated by {COMPANY.legalName}. We aggregate publicly available tender notices from UN
          agencies, multilateral banks and national governments, and turn them into a searchable workspace for
          Chinese suppliers.
        </p>
      </header>

      <section className="grid gap-3 py-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-2xl font-extrabold text-training-green">{s.value}</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3 py-6">
        <h2 className="text-xl font-bold text-slate-900">What we do</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          We collect procurement notices from official portals, normalise country, buyer and commodity data, and
          publish a public detail page for each notice. Suppliers can search by country, buyer, category and
          deadline, then use the platform to decide whether to bid.
        </p>
        <p className="text-sm leading-relaxed text-slate-600">
          Beyond search, we provide a supplier directory, bid preparation support and practical training for teams
          new to international public procurement.
        </p>
      </section>

      <section className="space-y-3 py-6">
        <h2 className="text-xl font-bold text-slate-900">How we work</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-600">
          <li>Notices are linked back to the official source; the official notice always prevails.</li>
          <li>Active means the deadline has not passed, or the notice has no fixed deadline.</li>
          <li>We do not represent any procurement agency and do not guarantee award outcomes.</li>
          <li>Contact details and full documents may require an account or membership.</li>
        </ul>
      </section>

      <section className="space-y-3 py-6">
        <h2 className="text-xl font-bold text-slate-900">Company information</h2>
        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
          {[
            ["Legal name", COMPANY.legalName],
            ["Chinese name", COMPANY.nameZh],
            ["Unified social credit code", COMPANY.taxID],
            ["Registered address", COMPANY.address],
            ["Founded", COMPANY.foundingDate],
            ["Phone", COMPANY.phone],
            ["Email", COMPANY.email],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr]">
              <dt className="font-semibold text-slate-500">{k}</dt>
              <dd className="text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-wrap gap-3 py-6">
        <Link
          href="/en/contact"
          className="rounded-lg bg-training-green px-5 py-2.5 text-sm font-bold text-white hover:bg-training-green-hover"
        >
          Contact us
        </Link>
        <Link
          href="/en/faq"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green"
        >
          Read the FAQ
        </Link>
      </section>
    </EnglishShell>
  );
}
