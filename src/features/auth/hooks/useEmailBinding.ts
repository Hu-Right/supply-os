/**
 * 邮箱绑定 Hook
 * Email Binding Hook
 *
 * @module features/auth/hooks/useEmailBinding
 */
import { useState, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { api, ApiError } from "@/core/http";

export type EmailView = "idle" | "binding" | "unbinding";

export interface UseEmailBindingReturn {
  t: ReturnType<typeof useLocale>["t"];
  view: EmailView;
  setView: (view: EmailView) => void;
  email: string;
  setEmail: (email: string) => void;
  code: string;
  setCode: (code: string) => void;
  message: string;
  isError: boolean;
  loading: boolean;
  codeSent: boolean;
  countdown: number;
  hasEmail: boolean;
  currentEmail: string | null | undefined;
  isVerified: boolean;
  handleSendCode: (scene: "bind" | "unbind") => Promise<void>;
  handleBind: () => Promise<void>;
  handleUnbind: () => Promise<void>;
  resetState: () => void;
}

export function useEmailBinding(): UseEmailBindingReturn {
  const { t } = useLocale();
  const { authUser, refreshAuth } = useAuth();

  const [view, setView] = useState<EmailView>("idle");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const hasEmail = !!authUser?.email;
  const currentEmail = authUser?.email;
  const isVerified = authUser?.email_verified === 1;

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const resetState = () => {
    setEmail("");
    setCode("");
    setMessage("");
    setIsError(false);
    setCodeSent(false);
    setCountdown(0);
    setLoading(false);
  };

  const handleSendCode = async (scene: "bind" | "unbind") => {
    if (!authUser?.id) return;
    if (scene === "bind" && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      setMessage(t("authEmailInvalid") || "请输入有效的邮箱地址");
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const data = await api<{ email_sent: boolean; error?: string }>("/api/auth/send-email-code", {
        method: "POST",
        body: {
          email: scene === "unbind" ? "" : email,
          scene,
        },
      });
      if (!data.email_sent) {
        setMessage(data.error || (t("authEmailSendFailed") || "邮件发送失败"));
        setIsError(true);
      } else {
        setCodeSent(true);
        setCountdown(60);
        setMessage("");
        setIsError(false);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (t("authEmailSendFailed") || "邮件发送失败");
      setMessage(msg);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleBind = async () => {
    if (!authUser?.id || !email || !code) return;
    setLoading(true);
    setMessage("");
    try {
      await api("/api/auth/bind-email", {
        method: "POST",
        body: { email, code },
      });
      setMessage(t("authEmailBindSuccess") || "邮箱绑定成功");
      setIsError(false);
      setView("idle");
      resetState();
      await refreshAuth();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (t("authEmailBindFailed") || "绑定失败");
      setMessage(msg);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleUnbind = async () => {
    if (!authUser?.id || !code) return;
    setLoading(true);
    setMessage("");
    try {
      await api("/api/auth/unbind-email", {
        method: "POST",
        body: { code },
      });
      setMessage(t("authEmailUnbindSuccess") || "邮箱已解绑");
      setIsError(false);
      setView("idle");
      resetState();
      await refreshAuth();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (t("authEmailUnbindFailed") || "解绑失败");
      setMessage(msg);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return {
    t,
    view,
    setView,
    email,
    setEmail,
    code,
    setCode,
    message,
    isError,
    loading,
    codeSent,
    countdown,
    hasEmail,
    currentEmail,
    isVerified,
    handleSendCode,
    handleBind,
    handleUnbind,
    resetState,
  };
}
