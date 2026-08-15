/**
 * 注册验证码 Hook
 * Register Verification Code Hook
 *
 * @module features/auth/hooks/useRegisterCode
 */
import { useState, useEffect } from "react";
import { useLocale } from "@/core/i18n";

export function useRegisterCode() {
  const { t } = useLocale();

  const [registerVerifyCode, setRegisterVerifyCode] = useState("");
  const [registerCodeSent, setRegisterCodeSent] = useState(false);
  const [registerCodeLoading, setRegisterCodeLoading] = useState(false);
  const [registerCodeError, setRegisterCodeError] = useState("");
  const [registerCodeCountdown, setRegisterCodeCountdown] = useState(0);

  // 倒计时
  useEffect(() => {
    if (registerCodeCountdown <= 0) return;
    const timer = setTimeout(() => setRegisterCodeCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [registerCodeCountdown]);

  const handleSendRegisterCode = async (email: string): Promise<void> => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setRegisterCodeError(t("authForgotEmailInvalid"));
      return;
    }

    setRegisterCodeLoading(true);
    setRegisterCodeError("");
    try {
      const res = await fetch("/api/auth/send-register-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegisterCodeError(data.error || "发送失败");
      } else if (!data.email_sent) {
        setRegisterCodeError(t("authForgotEmailSendFailed") || "邮件发送失败");
      } else {
        setRegisterCodeSent(true);
        setRegisterCodeCountdown(60);
      }
    } catch {
      setRegisterCodeError("发送失败，请稍后重试");
    } finally {
      setRegisterCodeLoading(false);
    }
  };

  const reset = () => {
    setRegisterVerifyCode("");
    setRegisterCodeSent(false);
    setRegisterCodeLoading(false);
    setRegisterCodeError("");
    setRegisterCodeCountdown(0);
  };

  return {
    t,
    registerVerifyCode,
    setRegisterVerifyCode,
    registerCodeSent,
    registerCodeLoading,
    registerCodeError,
    setRegisterCodeError,
    registerCodeCountdown,
    handleSendRegisterCode,
    reset,
  };
}
