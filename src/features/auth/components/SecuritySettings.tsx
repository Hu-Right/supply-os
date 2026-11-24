// i18n-allow-file: 账号安全页（一期，文案待统一接入 i18n 7 语）
/**
 * 账号安全（/settings/security）
 *
 * 对标云厂商账号中心安全模块：登录密码 / 手机绑定 / 邮箱绑定 / 两步验证（二期）/
 * 登录设备（当前会话）/ 注销账号。
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Laptop, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { Badge, Button, Input, Modal } from "@/shared/ui";
import { PhoneBinding } from "./PhoneBinding";
import { EmailBinding } from "./EmailBinding";

export function SecuritySettings() {
  const { authUser, logout } = useAuth();
  const router = useRouter();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [device, setDevice] = useState("");

  useEffect(() => {
    const ua = navigator.userAgent;
    const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : "未知系统";
    const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "未知浏览器";
    setDevice(`${os} · ${browser}`);
  }, []);

  if (!authUser) return null;

  const identifier = authUser.phone || authUser.email || "";
  const channel = authUser.phone ? "sms" : "email";

  const sendCode = async () => {
    setError("");
    setMessage("");
    if (!identifier) {
      setError("账号未绑定手机或邮箱，无法重置密码");
      return;
    }
    setSending(true);
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: { identifier, channel } });
      setStep(2);
      setMessage(`验证码已发送至 ${authUser.phone ? "绑定手机" : "绑定邮箱"}`);
    } catch {
      setError("验证码发送失败，请稍后重试或联系客服");
    } finally {
      setSending(false);
    }
  };

  const resetPassword = async () => {
    setError("");
    if (!code.trim()) {
      setError("请输入验证码");
      return;
    }
    if (newPassword.length < 8) {
      setError("新密码至少 8 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: { identifier, code: code.trim(), new_password: newPassword, channel },
      });
      setMessage("密码已重置，请使用新密码重新登录");
      await logout();
      setTimeout(() => router.push("/"), 1200);
    } catch {
      setError("密码重置失败，请检查验证码或稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const closeModal = () => {
    setPasswordOpen(false);
    setStep(1);
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("");
    setError("");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-white">
        <div className="border-b border-border px-5 py-3">
          <p className="text-sm font-bold text-foreground">登录与安全</p>
          <p className="mt-0.5 text-xs text-muted-foreground">管理登录密码、绑定方式与登录设备；敏感操作建议开启两步验证（二期）。</p>
        </div>
        <div className="divide-y divide-border/70">
          {/* 登录密码 */}
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600"><Lock className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">登录密码</p>
              <p className="mt-0.5 text-xs text-muted-foreground">已设置 · 建议每 90 天更换一次，修改后需重新登录</p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => setPasswordOpen(true)}>修改密码</Button>
          </div>
          {/* 手机 */}
          <PhoneBinding />
          {/* 邮箱 */}
          <EmailBinding />
          {/* 两步验证（二期） */}
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600"><KeyRound className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">两步验证 <Badge variant="soft-neutral" shape="tag">即将上线</Badge></p>
              <p className="mt-0.5 text-xs text-muted-foreground">登录与敏感操作增加动态验证码，降低账号被盗风险（二期支持）。</p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto shrink-0" disabled>未开启</Button>
          </div>
        </div>
      </section>

      {/* 登录设备 */}
      <section className="rounded-xl border border-border bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground"><Laptop className="h-4 w-4 text-brand-600" />登录设备</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary-50 px-4 py-3 text-xs">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-brand-600"><Smartphone className="h-4 w-4" /></span>
          <div>
            <p className="font-semibold text-foreground">{device || "当前设备"}</p>
            <p className="mt-0.5 text-muted-foreground">当前会话 · 可通过退出登录结束会话</p>
          </div>
          <Badge variant="soft-success" shape="tag" className="ml-auto">当前设备</Badge>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          登录设备列表与远程下线能力将在二期提供（需后端会话管理）。如发现异常登录，请立即修改密码并联系客服。
        </p>
      </section>

      {/* 注销 */}
      <section className="rounded-xl border border-danger-200 bg-danger-50/40 p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-danger-700"><ShieldCheck className="h-4 w-4" />注销账号</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          注销后账号数据按《个人信息保护政策》处理，且不可恢复。注销前请确认已结清订单、下载所需发票。
        </p>
        <Link href="/account-cancellation" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-danger-600">
          前往注销账号<ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>

      {/* 修改密码弹窗 */}
      <Modal open={passwordOpen} onClose={closeModal} title="修改登录密码" className="max-w-md">
        <div className="space-y-3">
          <div className="rounded-xl bg-secondary-50 px-3 py-2 text-xs text-muted-foreground">
            将通过 {authUser.phone ? `绑定手机（${authUser.phone.replace(/^(\+?\d{3})\d+(\d{4})$/, "$1****$2")}）` : `绑定邮箱（${authUser.email}）`} 验证身份。
          </div>
          {step === 1 ? (
            <>
              <Button variant="primary" className="w-full" onClick={() => void sendCode()} disabled={sending}>
                {sending ? "发送中…" : "发送验证码"}
              </Button>
            </>
          ) : (
            <>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-foreground">验证码</span>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 位验证码" inputMode="numeric" maxLength={6} />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-foreground">新密码</span>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 8 位，含字母和数字" />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-foreground">确认新密码</span>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次输入新密码" />
              </label>
              <Button variant="primary" className="w-full" onClick={() => void resetPassword()} disabled={submitting}>
                {submitting ? "提交中…" : "重置密码"}
              </Button>
            </>
          )}
          {message && <p className="rounded-lg bg-success-50 px-2 py-1.5 text-[11px] font-semibold text-success-700">{message}</p>}
          {error && <p className="rounded-lg bg-danger-50 px-2 py-1.5 text-[11px] font-semibold text-danger-700">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
