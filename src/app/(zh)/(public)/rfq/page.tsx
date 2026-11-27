// i18n-allow-file: SEO 流程说明区按 ADR-0024 口径固定中文硬编码；交互区文案仍走客户端 i18n
/**
 * RFQ 采购需求发布页
 * RFQ Publish Page
 *
 * @module app/(public)/rfq
 * @description 交互面（主体认证卡 / 发布向导 / 需求广场）由 PageClient 客户端接管；
 *              页面尾部的「流程说明」区由本服务端组件直出——AI 爬虫不执行 JS，
 *              七步发布流程与适用对象必须进 HTML（Trendee AI 原生审计 2026-11-19：
 *              /rfq 可抓正文仅 478 字符、全页无流程语义，属 P0「商业核心页对 AI 不可见」）。
 *              流程口径与 FlowStepper 的 pc_flow_s1~s7 逐字一致，两处改动须同步；
 *              并输出 HowTo 结构化数据（只描述页面已展示的事实，ADR-0023 边界内）。
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import { jsonLdScript } from "@/lib/services/seo/json-ld";
import PageClient from "./page-client";

export const metadata: Metadata = {
  // 只写页面名（网站名由根 layout 模板拼在首位）；“供应商快速响应”等卖点归入 description
  title: "采购需求发布与询价（RFQ）",
  description: "一键发布采购需求与询价单（RFQ），获取优质供应商报价与平台顾问支持",
  alternates: {
    canonical: absoluteUrl("/rfq"),
    languages: { "x-default": absoluteUrl("/rfq") },
  },
};

/** 七步流程：与 FlowStepper（pc_flow_s1~s7）同口径；步骤说明以平台实际行为为准，不编造 */
const RFQ_STEPS: Array<{ name: string; text: string }> = [
  { name: "主体认证", text: "采购方提交主体资质并通过平台认证，获得需求发布资格。" },
  { name: "填写需求", text: "按向导分步填写采购需求，无需招标专业知识。" },
  { name: "确认版本", text: "核对并确认需求文档版本。" },
  { name: "生成授权书", text: "系统自动生成发布授权书文本。" },
  { name: "盖章签署", text: "采购方对授权书盖章签署。" },
  { name: "云境核验", text: "平台核验需求内容与授权文件。" },
  { name: "发布匹配", text: "核验通过后需求正式发布并获得正式编号，供应商匹配随即启动。" },
];

/** HowTo 结构化数据：只描述页面上已展示的七步（ADR-0023：不引入页面外事实） */
function howToJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "云境采购需求发布（RFQ）七步流程",
    description: "采购方在云境平台发布采购需求并启动供应商匹配的完整流程。",
    step: RFQ_STEPS.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

/**
 * 服务端直出的流程说明区（AI 与未登录用户同一份可见）。
 * 单独导出供版式契约测试断言七步口径与 HowTo 结构。
 */
export function RfqProcessSection() {
  return (
    <section aria-labelledby="rfq-process-title" className="border-t border-slate-200 bg-white px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <h2 id="rfq-process-title" className="text-lg font-extrabold text-slate-900">
          采购需求发布（RFQ）七步流程
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          云境采购需求发布（RFQ）面向有真实采购需求的企业与机构：不需要懂招标知识，按提示填写需求，
          系统自动生成编号并完成发布与供应商匹配。全流程共七步：
        </p>
        <ol className="mt-4 space-y-2">
          {RFQ_STEPS.map((s, i) => (
            <li key={s.name} className="flex gap-2 text-sm leading-6 text-slate-700">
              <span className="shrink-0 font-bold text-teal-700">{i + 1}.</span>
              <span>
                <strong className="text-slate-900">{s.name}</strong>
                <span className="text-slate-500">——{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(howToJsonLd()) }} />
      </div>
    </section>
  );
}

export default function RFQPage() {
  return (
    <>
      <PageClient />
      {/* GEO：HowTo 结构化数据保留（机器可读、用户不可见）；七步流程的用户可见呈现
          由向导顶部 FlowStepper 承载，不再重复渲染文字版流程区（2026-11-27） */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(howToJsonLd()) }} />
    </>
  );
}
