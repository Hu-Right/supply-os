/**
 * /en/contact — Contact (English)
 */
import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../../shell";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { jsonLdScript } from "@/lib/services/seo/json-ld";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Contact Yunjing: email 632236300@qq.com, phone +86 13857143215, or visit our registered office in Hangzhou, Zhejiang, China.",
  alternates: {
    canonical: absoluteUrl("/en/contact"),
    languages: {
      en: absoluteUrl("/en/contact"),
      "zh-CN": absoluteUrl("/contact"),
      "x-default": absoluteUrl("/contact"),
    },
  },
  openGraph: {
    title: "Contact Yunjing",
    description: "Talk to the Yunjing team about procurement search, supplier discovery or bid support.",
    url: absoluteUrl("/en/contact"),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

const CONTACT = {
  phone: "+86 13857143215",
  email: "632236300@qq.com",
  address:
    "Room 101-102, Building 9, No. 2 Tongshanxi Road, Zhongtai Street, Yuhang District, Hangzhou, Zhejiang, China",
  legalName: "Hangzhou Yunjing Zhizhan Technology Co., Ltd.",
  taxID: "91330110MAEQC7N58T",
};

export default function EnglishContactPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Contact Yunjing",
    url: absoluteUrl("/en/contact"),
    mainEntity: {
      "@type": "Organization",
      name: "Yunjing International Procurement Platform",
      legalName: CONTACT.legalName,
      taxID: CONTACT.taxID,
      email: CONTACT.email,
      telephone: CONTACT.phone,
      address: {
        "@type": "PostalAddress",
        streetAddress: CONTACT.address,
        addressCountry: "CN",
      },
    },
  };

  return (
    <EnglishShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <header className="space-y-3 py-6">
        <p className="text-xs font-bold uppercase tracking-widest text-training-green">Contact</p>
        <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">Talk to the Yunjing team</h1>
        <p className="max-w-3xl text-base leading-relaxed text-slate-600">
          Questions about a notice, supplier discovery, membership or bid support? Send us the notice reference
          and what you are trying to decide, and we will point you to the right next step.
        </p>
      </header>

      <section className="grid gap-4 py-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-900">Email</h2>
          <a href={`mailto:${CONTACT.email}`} className="mt-2 block text-lg font-bold text-training-green hover:underline">
            {CONTACT.email}
          </a>
          <p className="mt-1 text-xs text-slate-500">Best for detailed requirements and document checklists.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-900">Phone</h2>
          <a href={`tel:${CONTACT.phone.replace(/\s/g, "")}`} className="mt-2 block text-lg font-bold text-training-green hover:underline">
            {CONTACT.phone}
          </a>
          <p className="mt-1 text-xs text-slate-500">Monday to Friday, 09:00–18:00 China Standard Time.</p>
        </div>
      </section>

      <section className="space-y-3 py-6">
        <h2 className="text-xl font-bold text-slate-900">Registered office</h2>
        <p className="text-sm leading-relaxed text-slate-600">{CONTACT.address}</p>
        <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
          {[
            ["Legal name", CONTACT.legalName],
            ["Unified social credit code", CONTACT.taxID],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr]">
              <dt className="font-semibold text-slate-500">{k}</dt>
              <dd className="text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-wrap gap-3 py-4">
        <Link
          href="/en/faq"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green"
        >
          Read the FAQ first
        </Link>
        <Link
          href="/en/services"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green"
        >
          See our services
        </Link>
      </section>
    </EnglishShell>
  );
}
