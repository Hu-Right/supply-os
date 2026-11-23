// i18n-allow-file: 法律文本（版权与转载）以中文法律版为准，翻译需法务审校，不随界面语言切换
/**
 * /copyright — 版权与转载许可声明
 */
import type { Metadata } from "next";
import { LegalPageContent } from "../legal-page";

export const metadata: Metadata = {
  title: "版权与数据库使用说明",
  description: "OS NEO SMART 标讯原文版权、平台编排权利、转载与下载使用规则",
};

export default function CopyrightPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">版权与转载许可声明</h1>
        <p className="mt-1 text-xs text-slate-500">
          内容来源：摘自《用户服务协议》V2.0 第10条（2026年9月2日生效）｜原文照录 &nbsp;|&nbsp; 运营主体：杭州云境智展科技有限公司
        </p>
      </header>
      <LegalPageContent filename="copyright.txt" />
      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>© 2026 杭州云境智展科技有限公司 &nbsp;|&nbsp; osneosmart.com</p>
      </footer>
    </article>
  );
}
