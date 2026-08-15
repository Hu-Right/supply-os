/**
 * 找回密码 Hook
 * Forgot Password Hook
 *
 * @module features/auth/hooks/useForgotPassword
 */
import { useState } from "react";
import { useLocale } from "@/core/i18n";
import { validatePassword } from "@/shared/auth/passwordPolicy";

/** 邮箱脱敏：显示首尾字符，中间用 ** 替代 */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return email;
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}**@${domain}`;
  }
  return `${local[0]}**${local[local.length - 1]}@domain}`;
}

/** 手机号脱敏：显示前3后4，中间用 **** 替代 */
export function maskPhone(phone: string): string {
  const p = phone.trim();
  if (!p) return p;
  if (p.length < 8) return p.slice(0, 2) + "****";
  return p.slice(0, 3) + "****" + p.slice(-4);
}

/** 根据输入格式智能识别验证渠道 */
export function detectChannel(identifier: string): "email" | "sms" {
  return /^1[3-9]\d{9}$/.test(identifier.trim()) ? "sms" : "email";
}

export function useForgotPassword(onSuccess: () => void) {
  const { t } = useLocale();

  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [showSupportHint, setShowSupportHint] = useState(false);

  const reset = () => {
    setForgotStep(1);
    setForgotEmail("");
    setForgotCode("");
    setForgotNewPassword("");
    setForgotError("");
    setForgotSuccess("");
    setShowSupportHint(false);
  };

  const handleSendResetCode = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setForgotError("");
    setForgotSuccess("");
    setShowSupportHint(false);

    const identifier = forgotEmail.trim();
    if (!identifier) {
      setForgotError(t("authForgotIdentifierInvalid") || "请输入邮箱或手机号");
      return;
    }

    const channel = detectChannel(identifier);

    if (channel === "sms") {
      if (!/^1[3-9]\d{9}$/.test(identifier)) {
        setForgotError(t("authPhoneInvalid") || "请输入有效的手机号");
        return;
      }
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
        setForgotError(t("authForgotEmailInvalid"));
        return;
      }
    }

    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, channel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setForgotError(data.error || "发送验证码失败");
      } else if (channel === "sms") {
        if (data.sms_sent === false) {
          setShowSupportHint(true);
          setForgotError(data.support_hint || "短信发送失败");
        } else {
          setForgotStep(2);
          setForgotSuccess(t("authForgotSmsCodeSent") || "验证码已发送到您的手机，请查收");
        }
      } else {
        if (data.email_sent === false) {
          setShowSupportHint(true);
          setForgotError(t("authForgotEmailSendFailed") || "验证码邮件发送失败，请检查邮箱地址是否正确");
        } else {
          setForgotStep(2);
          setForgotSuccess(t("authForgotCodeSent"));
        }
      }
    } catch (err: any) {
      setForgotError(err.message || t("authForgotSendFailed"));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setForgotError("");

    if (forgotCode.trim().length !== 6) {
      setForgotError(t("authForgotCodeInvalid"));
      return;
    }
    const pwCheck = validatePassword(forgotNewPassword);
    if (!pwCheck.valid) {
      setForgotError(pwCheck.message);
      return;
    }

    const identifier = forgotEmail.trim();
    const channel = detectChannel(identifier);

    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: identifier,
          channel,
          code: forgotCode.trim(),
          new_password: forgotNewPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "重置密码失败");
      onSuccess();
    } catch (err: any) {
      setForgotError(err.message || t("authForgotResetFailed"));
    } finally {
      setForgotLoading(false);
    }
  };

  return {
    t,
    forgotStep,
    setForgotStep,
    forgotEmail,
    setForgotEmail,
    forgotCode,
    setForgotCode,
    forgotNewPassword,
    setForgotNewPassword,
    forgotLoading,
    forgotError,
    setForgotError,
    forgotSuccess,
    setForgotSuccess,
    showSupportHint,
    setShowSupportHint,
    handleSendResetCode,
    handleResetPassword,
    reset,
    maskEmail,
    maskPhone,
    detectChannel,
  };
}
