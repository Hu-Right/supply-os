/**
 * 注册验证码 Hook
 * Register Verification Code Hook
 *
 * @module features/auth/hooks/useRegisterCode
 */
import { useState, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";

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
      // 双轨制退役（轨道C）：统一走 api()；非 2xx 抛 ApiError（message = 服务端 error 字段）
      const data = await api<{ email_sent?: boolean }>(
        "/api/auth/send-register-code",
        { method: "POST", body: { email } },
      );
      if (!data.email_sent) {
        setRegisterCodeError(t("authForgotEmailSendFailed") || "邮件发送失败");
      } else {
        setRegisterCodeSent(true);
        setRegisterCodeCountdown(60);
      }
    } catch (err: unknown) {
      setRegisterCodeError((err as Error).message || "发送失败，请稍后重试");
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
