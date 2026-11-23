// i18n-allow-file: 法律文本（投诉与争议）以中文法律版为准，翻译需法务审校，不随界面语言切换
/**
 * /complaint — 投诉与争议解决
 */
import type { Metadata } from "next";
import { LegalPageContent } from "../legal-page";

export const metadata: Metadata = {
  title: "投诉与争议",
  description: "OS NEO SMART 投诉受理范围、提交渠道、处理时限与争议解决方式",
};

export default function ComplaintPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">投诉与争议解决</h1>
        <p className="mt-1 text-xs text-slate-500">
          版本：V1.0 &nbsp;|&nbsp; 生效日期：2026年11月23日 &nbsp;|&nbsp; 运营主体：杭州云境智展科技有限公司
        </p>
      </header>
      <LegalPageContent filename="complaint.txt" />
      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>© 2026 杭州云境智展科技有限公司 &nbsp;|&nbsp; osneosmart.com</p>
      </footer>
    </article>
  );
}
