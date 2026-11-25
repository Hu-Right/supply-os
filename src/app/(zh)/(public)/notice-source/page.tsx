// i18n-allow-file: 法律文本（标讯来源声明）以中文法律版为准，翻译需法务审校，不随界面语言切换
/**
 * /notice-source — 标讯来源与使用声明
 */
import type { Metadata } from "next";
import { LegalPageContent } from "../legal-page";

export const metadata: Metadata = {
  title: "标讯来源与使用说明",
  description: "云境·国际采购平台标讯来源、更新时效、准确性与官方投标渠道说明",
};

export default function NoticeSourcePage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">标讯来源与使用说明</h1>
        <p className="mt-1 text-xs text-slate-500">
          更新日期：2026年11月23日 &nbsp;|&nbsp; 运营主体：杭州云境智展科技有限公司
        </p>
      </header>
      <LegalPageContent filename="notice-source.txt" />
      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>© 2026 杭州云境智展科技有限公司 &nbsp;|&nbsp; osneosmart.com</p>
      </footer>
    </article>
  );
}
