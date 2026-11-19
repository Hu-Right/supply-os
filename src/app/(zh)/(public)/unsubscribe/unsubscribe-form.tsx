// i18n-allow-file: 邮件退订落地页的客户端按钮/结果文案，与 page.tsx 同属固定中英双语静态页，不接入 7 语运行时
"use client";

/**
 * 退订确认按钮：POST /api/unsubscribe（写黑名单 + 回写 outreach_items）。
 * 只在用户点击后发请求，GET 打开页面不会产生任何写入。
 */
import { useState } from "react";

type State = "idle" | "loading" | "done" | "error";

export function UnsubscribeForm({ token, email }: { token: string; email: string }) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  async function submit() {
    setState("loading");
    setMessage("");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null;
      if (!res.ok || !data?.success) {
        setState("error");
        setMessage(data?.message || "退订失败，请稍后重试或直接回复邮件。");
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setMessage("网络异常，请稍后重试或直接回复邮件。");
    }
  }

  if (state === "done") {
    return (
      <p className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        已退订，后续不会再向 {email} 发送此类邮件。
      </p>
    );
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={submit}
        disabled={state === "loading"}
        className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "loading" ? "提交中…" : "确认退订"}
      </button>
      {state === "error" && <p className="mt-3 text-xs text-rose-600">{message}</p>}
    </div>
  );
}