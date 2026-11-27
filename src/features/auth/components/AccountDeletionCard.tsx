// i18n-allow-file: 账号安全页（一期仅中文，后续接入 i18n 7 语）
/**
 * 注销账号（验证码 → 冷静期 → 人工核验/自动执行）
 *
 * @description 对齐大厂流程：提交前短信/邮箱验证码确认身份；提交时检查未结清事项；
 *              提交后进入冷静期（默认 7 天），期间重新登录自动撤销；到期无阻塞项自动执行。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { api } from "@/core/http";
import { Button, Input, Modal } from "@/shared/ui";

type DeletionStatus = {
  id: number;
  status: "pending" | "cooling" | "processing" | "done" | "rejected" | "cancelled";
  coolingUntil: string | null;
  blockers: string[];
  createdAt: string;
  handledNote: string | null;
};

const STATUS_TEXT: Record<DeletionStatus["status"], string> = {
  pending: "已提交，等待客服核验",
  cooling: "冷静期中",
  processing: "客服正在处理",
  done: "注销已执行",
  rejected: "申请未通过",
  cancelled: "申请已撤销",
};

function formatDate(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("zh-CN", { hour12: false });
}

export function AccountDeletionCard() {
  const [request, setRequest] = useState<DeletionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeChannel, setCodeChannel] = useState<"sms" | "email" | null>(null);
  const [sending, setSending] = useState(false);
  const [reason, setReason] = useState("");
  const [contact, setContact] = useState("");
  const [ack, setAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ request: DeletionStatus | null }>("/api/user/account-deletion");
      setRequest(data.request ?? null);
    } catch {
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sendCode = async () => {
    setError("");
    setSending(true);
    try {
      const r = await api<{ channel: "sms" | "email"; expiresInSeconds: number }>(
        "/api/user/account-deletion/code",
        { method: "POST", body: {} },
      );
      setCodeChannel(r.channel);
    } catch (e) {
      setError((e as Error)?.message || "验证码发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    setError("");
    setBlockers([]);
    if (!ack) {
      setError("请先确认已了解注销影响");
      return;
    }
    if (!code.trim()) {
      setError("请输入验证码");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api<{ blocked?: boolean; blockers?: string[] }>("/api/user/account-deletion", {
        method: "POST",
        body: { code: code.trim(), reason: reason.trim() || undefined, contact: contact.trim() || undefined },
      });
      if (r?.blocked) {
        setBlockers(r.blockers ?? []);
        setError("存在未结清事项，请先处理后再提交");
        return;
      }
      setDone(true);
      await load();
    } catch (e) {
      setError((e as Error)?.message || "提交失败，请稍后重试或联系客服");
    } finally {
      setSubmitting(false);
    }
  };

  const active = request && ["pending", "cooling", "processing"].includes(request.status);

  return (
    <section className="rounded-xl border border-danger-200 bg-danger-50/40 p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-danger-700">
        <ShieldCheck className="h-4 w-4" />注销账号
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        注销后账号数据按《个人信息保护政策》处理，且不可恢复。提交需短信/邮箱验证码；
        提交后进入冷静期，期间重新登录会自动撤销申请。
      </p>

      {!loading && active && (
        <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs font-semibold text-danger-700">
          申请单 #{request!.id} · {STATUS_TEXT[request!.status]}
          {request!.status === "cooling" && request!.coolingUntil
            ? `（冷静期至 ${formatDate(request!.coolingUntil)}，期间重新登录即撤销）`
            : "（1–2 个工作日内联系您）"}
        </p>
      )}
      {!loading && request?.status === "rejected" && (
        <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-danger-700">
          上次申请未通过{request.handledNote ? `：${request.handledNote}` : ""}
        </p>
      )}
      {!loading && request?.status === "cancelled" && (
        <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-muted-foreground">
          上次申请已在冷静期内撤销；如需注销请重新提交。
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setDone(false); setBlockers([]); setError(""); setOpen(true); }}
          disabled={Boolean(active)}
        >
          {active ? "申请处理中" : "申请注销账号"}
        </Button>
        <Link href="/account-cancellation" className="inline-flex items-center gap-1 font-semibold text-danger-600">
          查看注销规则<ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="申请注销账号" className="max-w-md">
        {done ? (
          <div className="space-y-3 text-xs">
            <p className="rounded-lg bg-success-50 px-3 py-2 font-semibold text-success-700">
              已提交。冷静期内重新登录会自动撤销；冷静期结束后由系统或客服执行注销。
            </p>
            <Button variant="primary" className="w-full" onClick={() => setOpen(false)}>我知道了</Button>
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="rounded-lg bg-secondary-50 px-3 py-2 leading-relaxed text-muted-foreground">
              注销后将：<br />
              · 无法再登录，会员权益、收藏、订阅与提醒终止；<br />
              · 企业主体绑定解除，采购需求/报价不可继续操作；<br />
              · 个人信息删除或匿名化；订单、发票与税务记录按法定期限保留。
            </div>

            <div className="flex items-end gap-2">
              <label className="block flex-1">
                <span className="mb-1 block font-semibold text-foreground">身份验证码</span>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6 位验证码"
                  inputMode="numeric"
                  maxLength={6}
                />
              </label>
              <Button variant="outline" size="sm" onClick={() => void sendCode()} disabled={sending}>
                {sending ? "发送中…" : codeChannel ? "重新发送" : "发送验证码"}
              </Button>
            </div>
            {codeChannel && (
              <p className="text-[11px] text-muted-foreground">
                验证码已发送至{codeChannel === "sms" ? "绑定手机" : "绑定邮箱"}，10 分钟内有效。
              </p>
            )}

            <label className="block">
              <span className="mb-1 block font-semibold text-foreground">回联方式（选填）</span>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="手机号或邮箱" maxLength={200} />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold text-foreground">注销原因（选填）</span>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="便于我们改进服务" maxLength={500} />
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
              <span className="text-muted-foreground">我已了解上述影响，确认提交注销申请</span>
            </label>

            {blockers.length > 0 && (
              <ul className="list-disc space-y-1 rounded-lg bg-warning-50 px-5 py-2 text-warning-700">
                {blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
            )}
            {error && <p className="rounded-lg bg-danger-50 px-2 py-1.5 font-semibold text-danger-700">{error}</p>}

            <Button variant="primary" className="w-full" onClick={() => void submit()} disabled={submitting}>
              {submitting ? "提交中…" : "提交申请"}
            </Button>
          </div>
        )}
      </Modal>
    </section>
  );
}
