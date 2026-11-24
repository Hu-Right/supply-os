// i18n-allow-file: 常见问题以中文法律/业务口径为准，翻译需法务与业务共同审校
/**
 * /faq — 常见问题
 *
 * @description GEO/AI 引用基础页：每个问题一个独立小节 + FAQPage 结构化数据，
 *              回答按「可直接被摘录」的短段落组织（先结论、后条件、给内链）。
 *              内容只写平台已明确的事实，不承诺官方身份、不编造价格与时效。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/services/seo/site";
import { jsonLdScript } from "@/lib/services/seo/json-ld";
import { COMPANY } from "@/lib/services/seo/company";

export const metadata: Metadata = {
  title: "常见问题",
  description:
    "云境·国际采购平台常见问题：数据来源、覆盖范围、公告查看权限、会员与价格、UNGM 注册、投标资质、供应商入驻、采购需求发布与联系方式。",
  alternates: { canonical: absoluteUrl("/faq") },
  openGraph: {
    title: "云境·国际采购平台 | 常见问题",
    description: "数据来源、会员权限、投标资质、入驻与联系方式等常见问题。",
    url: absoluteUrl("/faq"),
    type: "website",
  },
};

interface FaqItem {
  q: string;
  a: string;
}

/** 20 个高意图问题：覆盖「是什么 / 数据可信吗 / 多少钱 / 怎么投 / 怎么用 / 怎么联系」 */
const FAQS: FaqItem[] = [
  {
    q: "云境·国际采购平台是什么？",
    a: "云境·国际采购平台（osneosmart.com）聚合联合国机构、世界银行及各国政府公开的招标与采购公告，为中国供应商提供公告检索、供应商目录、投标辅助服务与研修培训。平台是信息聚合与增值服务提供方，不是任何官方采购平台，不代报名、不代投标、不代缴保证金。",
  },
  {
    q: "平台的公告数据从哪里来？",
    a: "来自各国官方采购门户、联合国机构（如 UNGM、UNDP、UNICEF、WHO、UNOPS、UNHCR）及世界银行等公开渠道，按统一字段归一后入库。完整来源清单与使用边界见《标讯来源与使用说明》。",
  },
  {
    q: "覆盖多少个国家和机构？",
    a: "当前覆盖 180 多个国家和地区，以及联合国机构、多边银行和各国政府部门等采购方。各国在挂公告数量可在「按国家浏览」页实时查看。",
  },
  {
    q: "公告多久更新一次？",
    a: "数据每日增量同步；首页规模数字与列表缓存每 10 分钟刷新一次。公告以官方原文的发布时间和截止时间为准，平台展示的截止时间会统一换算为北京时间。",
  },
  {
    q: "为什么有的公告只能看到摘要？",
    a: "公开页面展示标题、采购方、国家/地区、截止时间、公告编号和一段公开摘要，供搜索引擎与未登录用户了解商机；完整描述、联系方式、采购文件和 AI 解读需要登录或开通会员后查看。",
  },
  {
    q: "会员能看到什么？价格是多少？",
    a: "会员可按档位查看完整公告描述、采购方联系方式、原始文件、AI 摘要与智能匹配、投标可行性报告等。当前个人会员 239 元/月起，企业会员与机构/API 版按档位计价，具体权益与价格以「会员套餐」页为准。",
  },
  {
    q: "会员可以退款吗？",
    a: "付费会员与增值服务的退款规则以《付费会员及退款规则》为准。购买前建议先确认档位与权益；有疑问可先联系客服。",
  },
  {
    q: "可以开发票吗？",
    a: "可以。下单后按页面提示或联系客服提供开票信息，平台按实际支付金额开具发票。",
  },
  {
    q: "中国供应商可以投联合国标吗？",
    a: "可以。中国企业是联合国采购的重要供应来源，但需要满足具体公告的注册、资质、认证与履约要求。建议先用「投标能力诊断」评估目标市场与资格缺口，再决定投哪个标。",
  },
  {
    q: "没有出口资质能投国际标吗？",
    a: "取决于公告的资格条款：部分货物类公告要求出口资质或产品认证，部分服务类公告不要求。平台的能力诊断会按目标市场列出法定门槛与建议补齐项，但不替代采购方的资格审查。",
  },
  {
    q: "UNGM 注册一般要多久？",
    a: "取决于资料完整度和联合国机构的审核进度，没有固定时效。资料齐全、产品分类与资质文件匹配的账号通常更快通过。平台提供 UNGM/平台注册托管服务，可协助整理资料。",
  },
  {
    q: "投标通常需要准备哪些文件？",
    a: "常见包括：营业执照与公司注册文件、相关资质认证、财务与银行资信证明、同类业绩、授权书、产品技术资料与报价文件。具体以每条公告的投标人须知为准。",
  },
  {
    q: "平台代投标或代缴保证金吗？",
    a: "不代投标、不代缴保证金，投标与报名请以官方电子采购系统为准。平台提供标书拆解与代写、认证/公证/翻译、商务谈判支持、履约与物流对接等辅助服务。",
  },
  {
    q: "中标后货款怎么收？",
    a: "由采购方按合同条款直接支付给中标供应商，平台不代收货款。跨境结算、信用证、账期与履约保函等事项，建议在投标前与采购方确认，并可咨询平台的履约服务。",
  },
  {
    q: "供应商如何入驻平台？",
    a: "注册账号后绑定企业、上传营业执照并提交审核，审核通过后进入供应商目录。入驻后可维护企业资料、能力画像与产品信息，获得商机匹配与采购方询盘。",
  },
  {
    q: "采购方如何发布采购需求？",
    a: "在「采购需求」页按七步流程发布：主体认证 → 填写需求 → 确认版本 → 生成授权书 → 盖章签署 → 云境核验 → 发布匹配。未通过主体与授权核验的需求不会对外发布。",
  },
  {
    q: "平台提供 API 或数据导出吗？",
    a: "机构/API 版套餐提供数据接口与授权使用；具体字段、调用方式与许可范围请联系客服，或查看会员套餐中的机构/API 版说明。",
  },
  {
    q: "公告信息一定准确吗？",
    a: "平台做聚合、归一与翻译，可能存在延迟或误差，最终以官方采购公告原文为准。发现错误可通过「投诉与争议」或客服反馈，我们会尽快核对修正。",
  },
  {
    q: "平台和官方采购机构是什么关系？",
    a: "平台与联合国机构、各国政府等采购方没有隶属或代理关系，不代表任何官方机构。平台展示的机构名称、标识仅用于说明信息来源。",
  },
  {
    q: "如何联系云境？",
    a: COMPANY.supportEmail
      ? `客服邮箱：${COMPANY.supportEmail}；也可通过「联系我们」或「投诉与争议」页面提交。服务时间：工作日 9:00–18:00。`
      : "可通过「联系我们」或「投诉与争议」页面提交，我们会在 1 个工作日内回复。服务时间：工作日 9:00–18:00。",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function FaqPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd) }} />

      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">常见问题</h1>
        <p className="mt-2 text-slate-500">
          关于数据来源、会员权限、投标资质与使用方式的 20 个常见问题。找不到答案可
          <Link href="/contact" className="mx-1 text-teal-700 hover:underline">联系我们</Link>
          或提交
          <Link href="/complaint" className="mx-1 text-teal-700 hover:underline">投诉与争议</Link>。
        </p>
      </header>

      <div className="space-y-8">
        {FAQS.map((item, idx) => (
          <section key={item.q} id={`faq-${idx + 1}`} className="scroll-mt-24">
            <h2 className="text-base font-bold text-slate-900">
              {idx + 1}. {item.q}
            </h2>
            <p className="mt-2 text-slate-600">{item.a}</p>
          </section>
        ))}
      </div>

      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>
          相关页面：
          <Link href="/about" className="mx-1 text-teal-700 hover:underline">关于我们</Link>
          <Link href="/notice-source" className="mx-1 text-teal-700 hover:underline">标讯来源</Link>
          <Link href="/membership" className="mx-1 text-teal-700 hover:underline">会员套餐</Link>
          <Link href="/refund-policy" className="mx-1 text-teal-700 hover:underline">退款规则</Link>
          <Link href="/terms" className="mx-1 text-teal-700 hover:underline">服务协议</Link>
        </p>
        <p className="mt-2">更新日期：2026 年 11 月 24 日</p>
      </footer>
    </article>
  );
}
