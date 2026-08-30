/**
 * /refund-policy — 付费会员及退款规则（全文）
 */
import type { Metadata } from "next";
import { LegalPageContent } from "../legal-page";

export const metadata: Metadata = {
  title: "付费会员及退款规则 — OS NEO SMART",
  description: "OS NEO SMART 付费会员及退款规则，版本 V1.0，2026年8月29日生效",
};

export default function RefundPolicyPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">OS NEO SMART 付费会员及退款规则</h1>
        <p className="mt-1 text-xs text-slate-500">
          版本：V1.0 &nbsp;|&nbsp; 生效日期：2026年8月29日 &nbsp;|&nbsp; 运营主体：杭州云境智展科技有限公司
        </p>
      </header>
      <LegalPageContent filename="refund-policy.txt" />
      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>© 2026 杭州云境智展科技有限公司 &nbsp;|&nbsp; osneosmart.com</p>
      </footer>
    </article>
  );
}
