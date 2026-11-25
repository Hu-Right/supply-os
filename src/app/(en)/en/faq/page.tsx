/**
 * /en/faq — Frequently asked questions (English, FAQPage schema)
 */
import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../../shell";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { jsonLdScript } from "@/lib/services/seo/json-ld";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers about Yunjing's procurement notices, data sources, coverage, free access, contact details and bid support.",
  alternates: {
    canonical: absoluteUrl("/en/faq"),
    languages: {
      en: absoluteUrl("/en/faq"),
      "zh-CN": absoluteUrl("/faq"),
      "x-default": absoluteUrl("/faq"),
    },
  },
  openGraph: {
    title: "FAQ | Yunjing",
    description: "Common questions about global procurement notices and Yunjing.",
    url: absoluteUrl("/en/faq"),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

const faqs = [
  {
    q: "What is Yunjing?",
    a: "Yunjing is a procurement intelligence platform operated by Hangzhou Yunjing Zhizhan Technology Co., Ltd. It aggregates public tender notices from UN agencies, multilateral banks and national governments, and provides search, supplier discovery and bid support for Chinese suppliers.",
  },
  {
    q: "Where do the notices come from?",
    a: "Notices are collected from official procurement portals and public sources, including UNGM, multilateral banks and national government tender systems. Every notice links back to its official source; the official notice always prevails.",
  },
  {
    q: "How often is the data updated?",
    a: "New notices are synchronised continuously, and deadlines are recalculated against the current time. A notice is shown as active when its deadline has not passed, or when it has no fixed deadline.",
  },
  {
    q: "Which countries and organisations are covered?",
    a: "The platform currently covers 189 countries and regions, plus UN agencies, multilateral banks and many national procurement authorities.",
  },
  {
    q: "Is it free to use?",
    a: "Search and public notice summaries are free. Contact details, full descriptions, attachments and some analysis features require an account or a paid membership; the exact scope is shown on each notice.",
  },
  {
    q: "Can I see the buyer's contact details?",
    a: "Public pages show the buyer agency and summary. Full contact details and documents are part of the member workspace; when they are not published by the buyer, we do not invent them.",
  },
  {
    q: "Do you help with bid preparation?",
    a: "Yes. We offer eligibility review, document checklists, timeline planning and practical training. We do not submit bids on your behalf and do not guarantee award outcomes.",
  },
  {
    q: "Is the information official?",
    a: "We aggregate public information and link to the official source. We are not a procurement agency and do not represent any buyer. Always verify requirements, deadlines and documents on the official portal before bidding.",
  },
  {
    q: "How do I search by country or category?",
    a: "Use the notice search to filter by country, buyer, commodity category, notice type and deadline. You can also browse country and category indexes and open a dedicated page for each notice.",
  },
  {
    q: "How can I contact Yunjing?",
    a: "Email 632236300@qq.com or call +86 13857143215. Our registered address is Room 101-102, Building 9, No. 2 Tongshanxi Road, Zhongtai Street, Yuhang District, Hangzhou, Zhejiang, China.",
  },
];

export default function EnglishFaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <EnglishShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <header className="space-y-3 py-6">
        <p className="text-xs font-bold uppercase tracking-widest text-training-green">FAQ</p>
        <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
          Frequently asked questions
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-slate-600">
          Short answers about the data, coverage, access and support. For anything else, contact us directly.
        </p>
      </header>

      <section className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {faqs.map((f) => (
          <details key={f.q} className="group px-5 py-4">
            <summary className="cursor-pointer list-none text-sm font-bold text-slate-900 marker:hidden">
              {f.q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.a}</p>
          </details>
        ))}
      </section>

      <section className="flex flex-wrap gap-3 py-6">
        <Link
          href="/en/contact"
          className="rounded-lg bg-training-green px-5 py-2.5 text-sm font-bold text-white hover:bg-training-green-hover"
        >
          Contact us
        </Link>
        <Link
          href="/en/procurement"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green"
        >
          Browse notices
        </Link>
      </section>
    </EnglishShell>
  );
}
