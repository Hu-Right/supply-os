// i18n-allow-file: 账号安全页（一期，文案待统一接入 i18n 7 语）
/**
 * 账号安全（/settings/security）
 *
 * 对标云厂商账号中心安全模块：登录密码 / 手机绑定 / 邮箱绑定 / 两步验证 / 注销账号。
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { Button, Input, Modal } from "@/shared/ui";
import { PhoneBinding } from "./PhoneBinding";
import { EmailBinding } from "./EmailBinding";
import { MfaSettings } from "./MfaSettings";
import { AccountDeletionCard } from "./AccountDeletionCard";

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

  if (!authUser) {
    return (
      <div className="rounded-xl border border-border bg-white px-6 py-12 text-center">
        <p className="text-sm font-bold text-foreground">请先登录后管理账号安全</p>
        <p className="mt-1.5 text-xs text-muted-foreground">登录后可修改密码、绑定手机/邮箱、开启两步验证。</p>
      </div>
    );
  }

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
          <p className="mt-0.5 text-xs text-muted-foreground">管理登录密码与绑定方式；敏感操作建议开启两步验证。</p>
        </div>
        <div className="divide-y divide-border/70">
          {/* 登录密码 */}
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600"><Lock className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">登录密码</p>
              <p className="mt-0.5 text-xs text-muted-foreground">已设置 · 修改后所有设备需重新登录</p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => setPasswordOpen(true)}>修改密码</Button>
          </div>
          {/* 手机 */}
          <PhoneBinding />
          {/* 邮箱 */}
          <EmailBinding />
          {/* 两步验证（TOTP 验证器） */}
          <MfaSettings />
        </div>
      </section>

      {/* 注销：自助申请 + 客服核验（企业主体/发票需人工处理） */}
      <AccountDeletionCard />

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


