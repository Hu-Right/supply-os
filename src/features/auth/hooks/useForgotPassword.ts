/**
 * 找回密码 Hook
 * Forgot Password Hook
 *
 * @module features/auth/hooks/useForgotPassword
 */
import { useState } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
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

/** 根据输入格式智能识别验证渠道：手机号 → sms，邮箱 → email，默认 sms */
export function detectChannel(identifier: string): "sms" | "email" {
  const trimmed = identifier.trim();
  if (/^1[3-9]\d{9}$/.test(trimmed)) return "sms";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "email";
  return "sms"; // 默认短信渠道
}

export function useForgotPassword(onSuccess: () => void) {
  const { t } = useLocale();

  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [showSupportHint, setShowSupportHint] = useState(false);

  const reset = () => {
    setForgotStep(1);
    setForgotIdentifier("");
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

    const identifier = forgotIdentifier.trim();
    if (!identifier) {
      setForgotError(t("authForgotIdentifierInvalid") || "请输入手机号或邮箱");
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
      // 双轨制退役（轨道C）：统一走 api()；非 2xx 抛 ApiError（message = 服务端 error 字段）
      const data = await api<{ sms_sent?: boolean; email_sent?: boolean; support_hint?: string | null }>(
        "/api/auth/forgot-password",
        { method: "POST", body: { identifier, channel } },
      );
      if (channel === "sms") {
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
    } catch (err: unknown) {
      setForgotError((err as Error).message || t("authForgotSendFailed"));
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

    const identifier = forgotIdentifier.trim();
    const channel = detectChannel(identifier);

    setForgotLoading(true);
    try {
      // 双轨制退役（轨道C）：统一走 api()；成功后由 onSuccess 回调处理登录态
      await api("/api/auth/reset-password", {
        method: "POST",
        body: {
          identifier,
          channel,
          code: forgotCode.trim(),
          new_password: forgotNewPassword,
        },
      });
      onSuccess();
    } catch (err: unknown) {
      setForgotError((err as Error).message || t("authForgotResetFailed"));
    } finally {
      setForgotLoading(false);
    }
  };

  return {
    t,
    forgotStep,
    setForgotStep,
    forgotIdentifier,
    setForgotIdentifier,
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
