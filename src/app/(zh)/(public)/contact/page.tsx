// i18n-allow-file: 联系方式以中文主体公示口径为准，翻译需法务审校
/**
 * /contact — 联系我们
 *
 * @description 主体联系方式汇聚页：客服邮箱/电话/地址/服务时间 + 投诉、关于、来源声明入口。
 *              所有字段来自 COMPANY（环境变量单一事实源），未配置的字段直接省略，
 *              不展示「待补充」占位，避免 AI 把占位当事实引用。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/services/seo/site";
import { COMPANY } from "@/lib/services/seo/company";

export const metadata: Metadata = {
  title: "联系我们",
  description: `联系云境·国际采购平台运营主体${COMPANY.name}：客服邮箱、电话、地址与服务时间，以及投诉与商务合作入口。`,
  alternates: { canonical: absoluteUrl("/contact") },
  openGraph: {
    title: "云境·国际采购平台 | 联系我们",
    description: "客服邮箱、电话、地址与服务时间。",
    url: absoluteUrl("/contact"),
    type: "website",
  },
};

export default function ContactPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">联系我们</h1>
        <p className="mt-2 text-slate-500">
          运营主体：{COMPANY.name} &nbsp;|&nbsp; 网站：{COMPANY.site}
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-slate-900">客服与商务</h2>
        <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {COMPANY.supportEmail && (
            <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr]">
              <dt className="text-slate-500">客服邮箱</dt>
              <dd className="break-all text-slate-800">
                <a href={`mailto:${COMPANY.supportEmail}`} className="text-teal-700 hover:underline">
                  {COMPANY.supportEmail}
                </a>
              </dd>
            </div>
          )}
          {COMPANY.supportPhone && (
            <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr]">
              <dt className="text-slate-500">客服电话</dt>
              <dd className="text-slate-800">
                <a href={`tel:${COMPANY.supportPhone.replace(/[^\d+]/g, "")}`} className="text-teal-700 hover:underline">
                  {COMPANY.supportPhone}
                </a>
              </dd>
            </div>
          )}
          {COMPANY.address && (
            <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr]">
              <dt className="text-slate-500">注册地址</dt>
              <dd className="text-slate-800">{COMPANY.address}</dd>
            </div>
          )}
          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr]">
            <dt className="text-slate-500">服务时间</dt>
            <dd className="text-slate-800">{COMPANY.serviceHours}</dd>
          </div>
          <div className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr]">
            <dt className="text-slate-500">ICP 备案</dt>
            <dd className="text-slate-800">
              <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">
                {COMPANY.icp}
              </a>
            </dd>
          </div>
        </dl>
        {!COMPANY.supportEmail && !COMPANY.supportPhone && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            客服邮箱与电话正在配置中。可先通过
            <Link href="/complaint" className="mx-1 font-semibold text-amber-900 underline">投诉与争议</Link>
            页面提交，我们会在 1 个工作日内回复。
          </p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-slate-900">按事项联系</h2>
        <ul className="space-y-2">
          <li>
            <span className="font-semibold text-slate-800">投诉与争议：</span>
            <Link href="/complaint" className="text-teal-700 hover:underline">《投诉与争议解决》</Link>
          </li>
          <li>
            <span className="font-semibold text-slate-800">账号与个人信息：</span>
            <Link href="/account-cancellation" className="text-teal-700 hover:underline">《个人信息与账号》</Link>
          </li>
          <li>
            <span className="font-semibold text-slate-800">标讯来源与使用边界：</span>
            <Link href="/notice-source" className="text-teal-700 hover:underline">《标讯来源与使用说明》</Link>
          </li>
          <li>
            <span className="font-semibold text-slate-800">运营主体与资质：</span>
            <Link href="/about" className="text-teal-700 hover:underline">《关于我们》</Link>
          </li>
          <li>
            <span className="font-semibold text-slate-800">常见问题：</span>
            <Link href="/faq" className="text-teal-700 hover:underline">《常见问题》</Link>
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-slate-900">主体信息</h2>
        <p>
          运营主体：{COMPANY.name}
          {COMPANY.creditCode && <>，统一社会信用代码：{COMPANY.creditCode}</>}
          {COMPANY.legalRep && <>，法定代表人：{COMPANY.legalRep}</>}
          。本平台是信息聚合与增值服务提供方，不代表任何官方采购机构。
        </p>
      </section>

      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>© 2026 {COMPANY.name} &nbsp;|&nbsp; {COMPANY.site}</p>
      </footer>
    </article>
  );
}
