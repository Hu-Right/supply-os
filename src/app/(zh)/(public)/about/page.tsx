// i18n-allow-file: 主体信息页以中文法律版为准，翻译需法务审校，不随界面语言切换
/**
 * /about — 关于我们 / 运营主体与联系方式
 *
 * @description 合规布点 P0：公司全称、统一社会信用代码、地址、客服联系方式、ICP 备案
 *              必须在全站可查。字段来自 COMPANY（环境变量单一事实源）；
 *              未配置的字段直接省略并在页尾统一说明，不输出「待补充」占位
 *              ——生成式引擎会把占位文本当成事实引用。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/services/seo/company";
import { absoluteUrl } from "@/lib/services/seo/site";

export const metadata: Metadata = {
  title: "关于我们",
  description: `云境·国际采购平台运营主体${COMPANY.name}：主体信息、联系方式与服务边界。`,
  alternates: { canonical: absoluteUrl("/about") },
};

export default function AboutPage() {
  const rows: Array<[string, React.ReactNode]> = [
    ["运营主体", COMPANY.name],
  ];
  if (COMPANY.creditCode) rows.push(["统一社会信用代码", COMPANY.creditCode]);
  if (COMPANY.address) rows.push(["注册地址", COMPANY.address]);
  if (COMPANY.legalRep) rows.push(["法定代表人", COMPANY.legalRep]);
  rows.push([
    "ICP 备案",
    <a
      key="icp"
      href="https://beian.miit.gov.cn/"
      target="_blank"
      rel="noreferrer"
      className="text-teal-700 hover:underline"
    >
      {COMPANY.icp}
    </a>,
  ]);
  if (COMPANY.icpLicense) rows.push(["增值电信业务经营许可证", COMPANY.icpLicense]);
  if (COMPANY.euRep) rows.push(["欧盟代表", COMPANY.euRep]);
  if (COMPANY.supportEmail) {
    rows.push([
      "客服邮箱",
      <a key="mail" href={`mailto:${COMPANY.supportEmail}`} className="text-teal-700 hover:underline">
        {COMPANY.supportEmail}
      </a>,
    ]);
  }
  if (COMPANY.supportPhone) rows.push(["客服电话", COMPANY.supportPhone]);
  rows.push(["网站", COMPANY.site]);

  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">关于我们</h1>
        <p className="mt-1 text-xs text-slate-500">
          运营主体：{COMPANY.name} &nbsp;|&nbsp; 更新日期：2026年11月24日
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-slate-900">平台定位</h2>
        <p className="mb-3">
          云境·国际采购平台面向中国供应商，聚合联合国、世界银行及各国政府采购的公开商机，
          提供商机检索、需求拆解、准入合规与投标辅助服务，帮助中国优质供应链对接全球采购市场。
        </p>
        <p>
          本平台是信息聚合与增值服务提供方，<strong>不是任何官方采购平台</strong>，
          不代供应商报名、投标或缴纳保证金。投标与报名请以官方电子采购系统为准，
          详见
          <Link href="/notice-source" className="mx-1 text-teal-700 hover:underline">《标讯来源与使用声明》</Link>
          与
          <Link href="/terms" className="mx-1 text-teal-700 hover:underline">《用户服务协议》</Link>。
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-slate-900">运营主体信息</h2>
        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
              <dt className="text-slate-500">{label}</dt>
              <dd className="break-all text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          营业执照、行政许可等未在页面公示的主体资料，可应要求核验，请通过
          <Link href="/contact" className="mx-1 text-teal-700 hover:underline">联系我们</Link>
          索取。
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-slate-900">联系我们</h2>
        <p className="mb-2">
          客服与商务：
          <Link href="/contact" className="text-teal-700 hover:underline">《联系我们》</Link>
          &nbsp;|&nbsp; 投诉与建议：
          <Link href="/complaint" className="text-teal-700 hover:underline">《投诉与争议解决》</Link>
        </p>
        <p className="text-slate-500">服务时间：{COMPANY.serviceHours}。</p>
      </section>

      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>© 2026 {COMPANY.name} &nbsp;|&nbsp; {COMPANY.site}</p>
      </footer>
    </article>
  );
}
