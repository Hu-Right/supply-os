// i18n-allow-file: 法律文本（隐私政策/服务协议/退款规则）以中文法律版为准，翻译需法务审校，不随界面语言切换
/**
 * /account-cancellation — 个人信息与账号规则（全文，含账号注销申请方式）
 */
import type { Metadata } from "next";
import { LegalPageContent } from "../legal-page";

export const metadata: Metadata = {
  // 只写文档名：网站名由根 layout 的 title.template 拼在首位
  title: "个人信息与账号规则",
  description: "OS NEO SMART 个人信息与账号规则：个人信息查阅、更正、删除、导出与账号注销申请方式",
};

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";

export default function AccountCancellationPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">个人信息与账号规则</h1>
        <p className="mt-1 text-xs text-slate-500">
          版本：V1.1 &nbsp;|&nbsp; 生效日期：2026年11月23日 &nbsp;|&nbsp; 运营主体：杭州云境智展科技有限公司
        </p>
      </header>
      <section className="mb-6 rounded-xl border border-teal-200 bg-teal-50 p-4 text-xs leading-relaxed text-teal-800">
        <p className="text-sm font-bold">如何申请</p>
        <p className="mt-1">
          账号注销，以及个人信息的查阅、复制、更正、删除、导出，均可通过客服邮箱申请（邮件标题请注明“账号权利申请”）。
          {SUPPORT_EMAIL ? (
            <>客服邮箱：<a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>。</>
          ) : (
            "客服邮箱以页脚公示为准。"
          )}
          我们将在 15 个工作日内完成身份核验并答复；涉及交易记录等依法需留存的信息，按法律规定保留，其余个人信息在注销后删除或匿名化。
        </p>
        <p className="mt-1 text-teal-700/80">当前为人工受理，暂未开放自助注销入口。</p>
      </section>

      <LegalPageContent filename="account-cancellation.txt" />
      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>© 2026 杭州云境智展科技有限公司 &nbsp;|&nbsp; osneosmart.com</p>
      </footer>
    </article>
  );
}
