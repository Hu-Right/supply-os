/**
 * /en/services — Services (English)
 */
import type { Metadata } from "next";
import Link from "next/link";
import { EnglishShell } from "../../shell";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Services",
  description:
    "Procurement notice search, supplier discovery, bid preparation support and practical training for international public procurement.",
  alternates: {
    canonical: absoluteUrl("/en/services"),
    languages: {
      en: absoluteUrl("/en/services"),
      "zh-CN": absoluteUrl("/services"),
      "x-default": absoluteUrl("/services"),
    },
  },
  openGraph: {
    title: "Services | Yunjing",
    description: "Search, supplier discovery, bid support and training for global public procurement.",
    url: absoluteUrl("/en/services"),
    type: "website",
    images: [DEFAULT_OG_IMAGE],
  },
};

const services = [
  {
    title: "Procurement notice search",
    body:
      "Search live tenders from UN agencies, multilateral banks and national governments. Filter by country, buyer agency, commodity category, notice type and deadline, and open a dedicated page for every notice.",
    href: "/en/procurement",
    cta: "Browse notices",
  },
  {
    title: "Supplier directory",
    body:
      "Find Chinese and international suppliers by industry, products and certifications. Use the directory to shortlist partners for a bid or to check who is already active in your category.",
    href: "/en/supplier",
    cta: "Open the directory",
  },
  {
    title: "Bid preparation support",
    body:
      "Get help turning a notice into a bid plan: eligibility review, document checklist, timeline and the questions to ask the buyer before submission.",
    href: "/en/contact",
    cta: "Talk to us",
  },
  {
    title: "Training and workshops",
    body:
      "Practical sessions on UNGM registration, reading a tender, preparing a compliant bid and avoiding common rejection reasons.",
    href: "/en/contact",
    cta: "Ask about training",
  },
];

export default function EnglishServicesPage() {
  return (
    <EnglishShell>
      <header className="space-y-3 py-6">
        <p className="text-xs font-bold uppercase tracking-widest text-training-green">Services</p>
        <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
          From a live notice to a bid decision
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-slate-600">
          Yunjing supports the full path: find the opportunity, check eligibility, prepare the documents and
          build the internal case for bidding.
        </p>
      </header>

      <section className="grid gap-4 py-4 sm:grid-cols-2">
        {services.map((s) => (
          <article key={s.title} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-900">{s.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{s.body}</p>
            <Link
              href={s.href}
              className="mt-4 text-sm font-bold text-training-green hover:underline"
            >
              {s.cta} →
            </Link>
          </article>
        ))}
      </section>

      <section className="space-y-3 py-8">
        <h2 className="text-xl font-bold text-slate-900">What we do not do</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-600">
          <li>We do not submit bids on your behalf or sign contracts for you.</li>
          <li>We do not guarantee that a bid will be shortlisted or awarded.</li>
          <li>We do not replace the official procurement portal or legal advice.</li>
        </ul>
      </section>

      <section className="flex flex-wrap gap-3 py-4">
        <Link
          href="/en/contact"
          className="rounded-lg bg-training-green px-5 py-2.5 text-sm font-bold text-white hover:bg-training-green-hover"
        >
          Discuss your requirement
        </Link>
        <Link
          href="/en/about"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green"
        >
          About Yunjing
        </Link>
      </section>
    </EnglishShell>
  );
}
