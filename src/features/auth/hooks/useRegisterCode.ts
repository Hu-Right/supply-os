/**
 * 注册验证码 Hook
 * Register Verification Code Hook
 *
 * @module features/auth/hooks/useRegisterCode
 */
import { useState } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { useCountdown } from "@/shared/hooks/useCountdown";

export function useRegisterCode() {
  const { t } = useLocale();

  const [registerVerifyCode, setRegisterVerifyCode] = useState("");
  const [registerCodeSent, setRegisterCodeSent] = useState(false);
  const [registerCodeLoading, setRegisterCodeLoading] = useState(false);
  const [registerCodeError, setRegisterCodeError] = useState("");
  const { countdown: registerCodeCountdown, start: startCountdown, reset: resetCountdown } = useCountdown();

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
        setRegisterCodeError(t("authSmsSendFailed") || "短信发送失败");
      } else {
        setRegisterCodeSent(true);
        startCountdown(60);
      }
    } catch (err: unknown) {
      setRegisterCodeError((err as Error).message || (t("authSmsSendFailed") || "发送失败，请稍后重试"));
    } finally {
      setRegisterCodeLoading(false);
    }
  };

  const reset = () => {
    setRegisterVerifyCode("");
    setRegisterCodeSent(false);
    setRegisterCodeLoading(false);
    setRegisterCodeError("");
    resetCountdown();
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
