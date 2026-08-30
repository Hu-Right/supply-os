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

  const handleSendSmsCode = async (phone: string): Promise<void> => {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      setRegisterCodeError(t("authPhoneInvalid") || "请输入有效的手机号");
      return;
    }

    setRegisterCodeLoading(true);
    setRegisterCodeError("");
    try {
      const data = await api<{ sms_sent?: boolean }>(
        "/api/auth/send-register-sms-code",
        { method: "POST", body: { phone } },
      );
      if (!data.sms_sent) {
        setRegisterCodeError("短信发送失败");
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
    handleSendSmsCode,
    reset,
  };
}
