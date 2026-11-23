// i18n-allow-file: 主体信息页以中文法律版为准，翻译需法务审校，不随界面语言切换
/**
 * /about — 关于我们 / 运营主体与联系方式
 *
 * 合规布点 P0：主体信息（公司全称、统一社会信用代码、地址、客服联系方式、ICP 备案）
 * 必须在全站可查。统一社会信用代码/地址/客服联系方式从 env 读取，未配置不臆造。
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "关于我们",
  description: "云境·国际采购平台运营主体、联系方式与服务边界",
};

const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || "杭州云境智展科技有限公司";
const COMPANY_CREDIT_CODE = process.env.NEXT_PUBLIC_COMPANY_CREDIT_CODE || "";
const COMPANY_ADDRESS = process.env.NEXT_PUBLIC_COMPANY_ADDRESS || "";
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "";
const ICP = "浙ICP备2026027779号-3";

export default function AboutPage() {
  const rows: Array<[string, React.ReactNode]> = [
    ["运营主体", COMPANY_NAME],
    ...(COMPANY_CREDIT_CODE ? [["统一社会信用代码", COMPANY_CREDIT_CODE] as [string, React.ReactNode]] : []),
    ...(COMPANY_ADDRESS ? [["注册地址", COMPANY_ADDRESS] as [string, React.ReactNode]] : []),
    ["ICP 备案", (
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">
        {ICP}
      </a>
    )],
    ...(SUPPORT_EMAIL ? [["客服邮箱", (
      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-700 hover:underline">{SUPPORT_EMAIL}</a>
    )] as [string, React.ReactNode]] : []),
    ...(SUPPORT_PHONE ? [["客服电话", SUPPORT_PHONE] as [string, React.ReactNode]] : []),
    ["网站", "osneosmart.com"],
  ];

  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">关于我们</h1>
        <p className="mt-1 text-xs text-slate-500">
          运营主体：{COMPANY_NAME} &nbsp;|&nbsp; 更新日期：2026年11月23日
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-3">平台定位</h2>
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
        <h2 className="text-lg font-bold text-slate-900 mb-3">运营主体信息</h2>
        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-1 px-4 py-3">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-slate-800 break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          如需核验营业执照等主体资料，可通过客服邮箱提出，我们将在核验后提供。
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-3">联系我们</h2>
        <p className="mb-2">
          投诉与建议：
          <Link href="/complaint" className="text-teal-700 hover:underline">《投诉与争议解决》</Link>
          {SUPPORT_EMAIL && <>（客服邮箱：{SUPPORT_EMAIL}）</>}
        </p>
        <p className="text-slate-500">
          服务时间：工作日 9:00–18:00（法定节假日除外）。
        </p>
      </section>

      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>© 2026 {COMPANY_NAME} &nbsp;|&nbsp; osneosmart.com</p>
      </footer>
    </article>
  );
}
