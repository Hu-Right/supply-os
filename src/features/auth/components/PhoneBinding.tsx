/**
 * 手机号绑定组件
 * Phone Binding Component
 *
 * @module features/auth/components/PhoneBinding
 * @description 用户手机号绑定 / 换绑 / 解绑管理面板。
 *              Phone number binding / rebinding / unbinding management panel.
 */
import { useState, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { api, ApiError } from "@/core/http";
import { Input } from "@/shared/ui";
import { Smartphone, ShieldCheck, Unlink } from "lucide-react";

type PhoneView = "idle" | "binding" | "rebinding" | "unbinding";

export function PhoneBinding() {
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

  /** 发送手机验证码 */
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

  /** 绑定手机号 */
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

  /** 换绑手机号 */
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

  /** 解绑手机号 */
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

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-teal-600" />
        <h4 className="text-sm font-extrabold text-slate-900">{t("authPhoneTitle")}</h4>
        {hasPhone && authUser?.phone_verified === 1 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            <ShieldCheck className="w-3 h-3" />
            {t("authPhoneVerified")}
          </span>
        )}
      </div>

      {/* 已绑定状态 */}
      {hasPhone && view === "idle" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            {t("authPhoneBound")}: <span className="font-mono font-bold text-slate-900">{authUser?.phone}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setView("rebinding"); resetState(); }}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              {t("authPhoneRebind")}
            </button>
            <button
              type="button"
              onClick={() => { setView("unbinding"); resetState(); }}
              className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-xs font-bold text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1"
            >
              <Unlink className="w-3 h-3" />
              {t("authPhoneUnbind")}
            </button>
          </div>
        </div>
      )}

      {/* 未绑定状态 */}
      {!hasPhone && view === "idle" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">{t("authPhoneNotBound")}</p>
          <button
            type="button"
            onClick={() => { setView("binding"); resetState(); }}
            className="px-4 py-2 rounded-lg bg-teal-600 text-white text-xs font-black hover:bg-teal-700"
          >
            {t("authPhoneBindAction")}
          </button>
        </div>
      )}

      {/* 绑定表单 */}
      {view === "binding" && (
        <div className="space-y-3">
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder={t("authPhoneBindPlaceholder")}
            className="bg-white"
          />
          <div className="flex gap-2">
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authPhoneCodePlaceholder")}
              maxLength={6}
              className="flex-1 bg-white tracking-widest"
            />
            <button
              type="button"
              disabled={loading || countdown > 0}
              onClick={() => handleSendCode("bind")}
              className="shrink-0 px-3 py-2 text-xs font-bold text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {countdown > 0 ? `${countdown}s` : loading ? t("authForgotSending") : t("authPhoneSendCode")}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || !phone || !code}
              onClick={handleBind}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white text-xs font-black hover:bg-teal-700 disabled:opacity-50"
            >
              {t("authPhoneBind")}
            </button>
            <button
              type="button"
              onClick={() => { setView("idle"); resetState(); }}
              className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {/* 换绑表单 */}
      {view === "rebinding" && (
        <div className="space-y-3">
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder={t("authPhoneNewPlaceholder")}
            className="bg-white"
          />
          <div className="flex gap-2">
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authPhoneCodePlaceholder")}
              maxLength={6}
              className="flex-1 bg-white tracking-widest"
            />
            <button
              type="button"
              disabled={loading || countdown > 0}
              onClick={() => handleSendCode("rebind")}
              className="shrink-0 px-3 py-2 text-xs font-bold text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {countdown > 0 ? `${countdown}s` : loading ? t("authForgotSending") : t("authPhoneSendCode")}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || !phone || !code}
              onClick={handleRebind}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white text-xs font-black hover:bg-teal-700 disabled:opacity-50"
            >
              {t("authPhoneRebindConfirm")}
            </button>
            <button
              type="button"
              onClick={() => { setView("idle"); resetState(); }}
              className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {/* 解绑表单 */}
      {view === "unbinding" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            {t("authPhoneUnbindHint")}: <span className="font-mono font-bold">{authUser?.phone}</span>
          </p>
          <div className="flex gap-2">
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authPhoneCodePlaceholder")}
              maxLength={6}
              className="flex-1 bg-white tracking-widest"
            />
            <button
              type="button"
              disabled={loading || countdown > 0}
              onClick={() => handleSendCode("unbind")}
              className="shrink-0 px-3 py-2 text-xs font-bold text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {countdown > 0 ? `${countdown}s` : loading ? t("authForgotSending") : t("authPhoneSendCode")}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || !code}
              onClick={handleUnbind}
              className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-black hover:bg-rose-700 disabled:opacity-50"
            >
              {t("authPhoneUnbindConfirm")}
            </button>
            <button
              type="button"
              onClick={() => { setView("idle"); resetState(); }}
              className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {/* 消息提示 */}
      {message && (
        <p className={`text-xs font-bold rounded-lg p-3 border ${
          isError
            ? "text-rose-600 bg-rose-50 border-rose-100"
            : "text-teal-700 bg-teal-50 border-teal-100"
        }`}>
          {message}
        </p>
      )}
    </div>
  );
}

PhoneBinding.displayName = "PhoneBinding";
