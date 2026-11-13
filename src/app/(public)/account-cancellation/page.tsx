// i18n-allow-file: 法律文本（隐私政策/服务协议/退款规则）以中文法律版为准，翻译需法务审校，不随界面语言切换
/**
 * /account-cancellation — 账号注销与个人信息管理规则（全文）
 */
import type { Metadata } from "next";
import { LegalPageContent } from "../legal-page";

export const metadata: Metadata = {
  // 只写文档名：网站名由根 layout 的 title.template 拼在首位
  title: "账号注销与个人信息管理规则",
  description: "OS NEO SMART 账号注销与个人信息管理规则，版本 V1.0，2026年8月29日生效",
};

export default function AccountCancellationPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">账号注销 / 个人信息管理规则</h1>
        <p className="mt-1 text-xs text-slate-500">
          版本：V1.0 &nbsp;|&nbsp; 生效日期：2026年8月29日 &nbsp;|&nbsp; 运营主体：杭州云境智展科技有限公司
        </p>
      </header>
      <LegalPageContent filename="account-cancellation.txt" />
      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>© 2026 杭州云境智展科技有限公司 &nbsp;|&nbsp; osneosmart.com</p>
      </footer>
    </article>
  );
}
