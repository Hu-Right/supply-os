/**
 * 手机号绑定 Hook
 * Phone Binding Hook
 *
 * @module features/auth/hooks/usePhoneBinding
 */
import { useState, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { api, ApiError } from "@/core/http";

export type PhoneView = "idle" | "binding" | "rebinding" | "unbinding";

export interface UsePhoneBindingReturn {
  t: (key: string) => string;
  view: PhoneView;
  setView: (view: PhoneView) => void;
  phone: string;
  setPhone: (phone: string) => void;
  code: string;
  setCode: (code: string) => void;
  message: string;
  isError: boolean;
  loading: boolean;
  codeSent: boolean;
  countdown: number;
  hasPhone: boolean;
  currentPhone: string | undefined;
  isVerified: boolean;
  handleSendCode: (scene: "bind" | "rebind" | "unbind") => Promise<void>;
  handleBind: () => Promise<void>;
  handleRebind: () => Promise<void>;
  handleUnbind: () => Promise<void>;
  resetState: () => void;
}

export function usePhoneBinding(): UsePhoneBindingReturn {
  const { t } = useLocale();
  const { authUser, refreshAuth } = useAuth();

  const [view, setView] = useState<PhoneView>("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const hasPhone = !!authUser?.phone;
  const currentPhone = authUser?.phone;
  const isVerified = authUser?.phone_verified === 1;

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const resetState = () => {
    setPhone("");
    setCode("");
    setMessage("");
    setIsError(false);
    setCodeSent(false);
    setCountdown(0);
    setLoading(false);
  };

  const handleSendCode = async (scene: "bind" | "rebind" | "unbind") => {
    if (!authUser?.user_key) return;
    if (scene !== "unbind" && (!phone || !/^1[3-9]\d{9}$/.test(phone))) {
      setMessage(t("authPhoneInvalid"));
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const data = await api<{ sms_sent: boolean; error?: string }>("/api/auth/send-phone-code", {
        method: "POST",
        body: {
          user_key: authUser.user_key,
          phone: scene === "unbind" ? "" : phone,
          scene,
        },
      });
      if (!data.sms_sent) {
        setMessage(data.error || t("authPhoneSendFailed"));
        setIsError(true);
      } else {
        setCodeSent(true);
        setCountdown(60);
        setMessage("");
        setIsError(false);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("authPhoneSendFailed");
      setMessage(msg || t("authPhoneSendFailed"));
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleBind = async () => {
    if (!authUser?.user_key || !phone || !code) return;
    setLoading(true);
    setMessage("");
    try {
      await api("/api/auth/bind-phone", {
        method: "POST",
        body: { user_key: authUser.user_key, phone, code },
      });
      setMessage(t("authPhoneBindSuccess"));
      setIsError(false);
      setView("idle");
      resetState();
      await refreshAuth();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("authPhoneBindFailed");
      setMessage(msg || t("authPhoneBindFailed"));
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleRebind = async () => {
    if (!authUser?.user_key || !phone || !code) return;
    setLoading(true);
    setMessage("");
    try {
      await api("/api/auth/rebind-phone", {
        method: "POST",
        body: { user_key: authUser.user_key, new_phone: phone, code },
      });
      setMessage(t("authPhoneRebindSuccess"));
      setIsError(false);
      setView("idle");
      resetState();
      await refreshAuth();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("authPhoneRebindFailed");
      setMessage(msg || t("authPhoneRebindFailed"));
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleUnbind = async () => {
    if (!authUser?.user_key || !code) return;
    setLoading(true);
    setMessage("");
    try {
      await api("/api/auth/unbind-phone", {
        method: "POST",
        body: { user_key: authUser.user_key, code },
      });
      setMessage(t("authPhoneUnbindSuccess"));
      setIsError(false);
      setView("idle");
      resetState();
      await refreshAuth();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("authPhoneUnbindFailed");
      setMessage(msg || t("authPhoneUnbindFailed"));
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return {
    t,
    view,
    setView,
    phone,
    setPhone,
    code,
    setCode,
    message,
    isError,
    loading,
    codeSent,
    countdown,
    hasPhone,
    currentPhone,
    isVerified,
    handleSendCode,
    handleBind,
    handleRebind,
    handleUnbind,
    resetState,
  };
}
