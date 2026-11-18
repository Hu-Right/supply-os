/**
 * /unsubscribe —— 邮件退订确认页
 *
 * 邮件里的 {unsubscribe_url} 指向这里（带 HMAC 签名 token）。
 * 页面只负责验签与展示，真正的写库在 POST /api/unsubscribe（确认按钮触发，
 * 避免邮件网关预取链接导致误退订）。
 */
import type { Metadata } from "next";
import { verifyUnsubToken } from "@/lib/services/unsubscribe/token";
import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = {
  title: "邮件退订",
  description: "停止接收 OS NEO SMART 的商机推荐与采购通知邮件",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const payload = raw ? verifyUnsubToken(raw) : null;

  return (
    <main className="mx-auto flex max-w-lg flex-col px-4 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">邮件退订 / Unsubscribe</h1>

        {!payload ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              这个退订链接无效或已损坏，可能不完整。请回到原邮件重新点击「退订」，或直接回复邮件说明。
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              This unsubscribe link is invalid or incomplete. Please use the link in the original
              email, or reply to it directly.
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              确认后，我们将停止向以下邮箱发送商机推荐与采购通知：
            </p>
            <p className="mt-2 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800">
              {payload.email}
            </p>
            <UnsubscribeForm token={String(raw)} email={payload.email} />
            <p className="mt-4 text-xs leading-relaxed text-slate-400">
              After confirming, no further recommendation or procurement notification emails will be
              sent to this address.
            </p>
          </>
        )}
      </div>
    </main>
  );
}