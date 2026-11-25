// i18n-allow-file: 中文 SEO 聚合页，文案随案例/机构固定
/**
 * /award-intelligence/case/[id] — 中标案例独立页（GEO 可引用资产）
 *
 * @description 每个案例一个可索引 URL：项目、机构、合同号、金额、中标方、原因、
 *              启发与官方来源链接，并输出 CaseStudy 结构化数据。
 *              数据源：src/data/cn-award-cases.ts（UNICEF/WHO 官方合同公示整理）。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CN_AWARD_CASES } from "@/data/cn-award-cases";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import { jsonLdScript } from "@/lib/services/seo/json-ld";
import { getServerLocale } from "@/lib/i18n/server";

export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return CN_AWARD_CASES.map((c) => ({ id: String(c.id) }));
}

function findCase(id: string) {
  return CN_AWARD_CASES.find((c) => String(c.id) === id) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const item = findCase(id);
  if (!item) return { title: "中标案例", robots: { index: false } };
  const title = `${item.agency} · ${item.content} — 中标案例`;
  const description = `${item.agency} ${item.date} 合同 ${item.contractNo}：${item.winnerCN} 中标，金额 ${item.amountText}。${item.reason}`.slice(0, 180);
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(`/award-intelligence/case/${item.id}`) },
    openGraph: {
      title,
      description,
      url: absoluteUrl(`/award-intelligence/case/${item.id}`),
      type: "article",
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function AwardCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = findCase(id);
  if (!item) notFound();
  const isZh = (await getServerLocale()) === "zh";
  const url = absoluteUrl(`/award-intelligence/case/${item.id}`);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CaseStudy",
    name: `${item.agency} ${item.content}`,
    description: item.reason,
    url,
    datePublished: item.date,
    about: item.category,
    isBasedOn: item.sourceLink,
    publisher: { "@type": "Organization", name: "云境·国际采购平台", url: absoluteUrl("") },
    subjectOf: { "@type": "CreativeWork", name: "官方合同公示", url: item.sourceLink },
  };

  const rows: Array<[string, string]> = [
    ["采购机构", item.agency],
    ["合同编号", item.contractNo],
    ["公布日期", item.date],
    ["采购内容", item.content],
    ["金额", item.amountText],
    ["协议类型", item.agreementType],
    ["覆盖范围", item.coverage],
    ["中标方（中文）", item.winnerCN],
    ["中标方（英文）", item.winnerEN],
    ["证据等级", item.evidenceLevel],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <nav aria-label={isZh ? "面包屑" : "Breadcrumb"} className="text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-training-green">{isZh ? "首页" : "Home"}</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/award-intelligence" className="hover:text-training-green">{isZh ? "中标情报" : "Award intelligence"}</Link></li>
          <li aria-hidden>/</li>
          <li className="text-slate-700">{isZh ? "中标案例" : "Case study"}</li>
        </ol>
      </nav>

      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-training-green">{item.category}</p>
        <h1 className="text-2xl font-bold leading-snug text-slate-900 sm:text-3xl">
          {item.agency} · {item.content}
        </h1>
        <p className="text-sm text-slate-600">
          {item.winnerCN} 于 {item.date} 获得合同 {item.contractNo}，金额 {item.amountText}。
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="w-40 bg-slate-50/60 px-4 py-3 text-left font-normal text-slate-500">{k}</th>
                <td className="px-4 py-3 text-slate-800">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-slate-900">为什么能中标</h2>
        <p className="text-sm leading-relaxed text-slate-600">{item.reason}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-slate-900">对供应商的启发</h2>
        <p className="text-sm leading-relaxed text-slate-600">{item.insight}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="text-slate-600">
          官方来源：{" "}
          <a href={item.sourceLink} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-training-green hover:underline">
            {item.sourceLink}
          </a>
        </p>
        <p className="mt-2 text-xs text-slate-500">
          案例来自 UNICEF/WHO 官方合同公示整理；具体条款以官方文件为准。云境不对投标结果作任何保证。
        </p>
      </section>

      <nav className="flex flex-wrap gap-3 py-2 text-sm">
        <Link href="/award-intelligence" className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 hover:border-training-green/40 hover:text-training-green">
          返回中标情报
        </Link>
        <Link href="/procurement" className="rounded-lg bg-training-green px-4 py-2 font-bold text-white hover:bg-training-green-hover">
          浏览全球商机
        </Link>
      </nav>
    </div>
  );
}
