/**
 * /terms — 用户服务协议（全文）
 */
import type { Metadata } from "next";
import { LegalPageContent } from "../legal-page";

export const metadata: Metadata = {
  title: "用户服务协议 — OS NEO SMART",
  description: "OS NEO SMART 用户服务协议（Terms of Service），版本 V1.0，2026年8月29日生效",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">OS NEO SMART 用户服务协议</h1>
        <p className="mt-1 text-xs text-slate-500">
          版本：V1.0 &nbsp;|&nbsp; 生效日期：2026年8月29日 &nbsp;|&nbsp; 运营主体：杭州云境智展科技有限公司
        </p>
      </header>
      <LegalPageContent filename="terms.txt" />
      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>© 2026 杭州云境智展科技有限公司 &nbsp;|&nbsp; osneosmart.com</p>
      </footer>
    </article>
  );
}
