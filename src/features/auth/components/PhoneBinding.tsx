/**
 * 手机号绑定行 — 智谱行式（实心圆图标 + 右侧实心蓝/红按钮）
 * Phone Binding Row
 *
 * @module features/auth/components/PhoneBinding
 * @description 安全设置行：实心品牌圆图标 + 标题/ masked 值灰描述 + 右侧实心
 *              「换绑/解绑/绑定」；编辑态行内展开。逻辑在 usePhoneBinding。
 */
import { Smartphone, ShieldCheck } from "lucide-react";
import { Input } from "@/shared/ui";
import { usePhoneBinding } from "../hooks/usePhoneBinding";

const btnBlue = "px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0 disabled:opacity-50";
const btnRed = "px-4 py-1.5 rounded-md bg-danger-600 text-white text-xs font-medium hover:bg-danger-700 transition-colors shrink-0 disabled:opacity-50";
const btnPlain = "px-4 py-1.5 rounded-md bg-white border border-border text-xs font-medium text-foreground hover:bg-secondary-50 transition-colors shrink-0";
const btnSend = "px-3 py-1.5 rounded-md bg-white border border-border text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors shrink-0 whitespace-nowrap disabled:opacity-50";

export function PhoneBinding() {
  const {
    t, view, setView, phone, setPhone, code, setCode,
    message, isError, loading, countdown,
    hasPhone, currentPhone, isVerified,
    handleSendCode, handleBind, handleRebind, handleUnbind, resetState,
  } = usePhoneBinding();

  const sendLabel = () =>
    countdown > 0 ? `${countdown}s` : loading ? t("authForgotSending") : t("authPhoneSendCode");

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-brand-500 text-white flex items-center justify-center shrink-0">
          <Smartphone className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{t("authPhoneTitle")}</p>
            {hasPhone && isVerified && (
              <span className="inline-flex items-center gap-1 text-2xs font-medium text-success-600">
                <ShieldCheck className="w-3 h-3" />
                {t("authPhoneVerified")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {hasPhone ? <span className="font-mono">{currentPhone}</span> : t("authPhoneNotBound")}
          </p>
        </div>
        {hasPhone && view === "idle" && (
          <div className="flex gap-2 shrink-0">
            <button type="button" className={btnBlue}
              onClick={() => { setView("rebinding"); resetState(); }}>
              {t("authPhoneRebind")}
            </button>
            <button type="button" className={btnRed}
              onClick={() => { setView("unbinding"); resetState(); }}>
              {t("authPhoneUnbind")}
            </button>
          </div>
        )}
        {!hasPhone && view === "idle" && (
          <button type="button" className={btnBlue}
            onClick={() => { setView("binding"); resetState(); }}>
            {t("authPhoneBindAction")}
          </button>
        )}
      </div>

      {view === "binding" && (
        <div className="mt-3 sm:pl-14 space-y-2 animate-fade-in max-w-md">
          <Input type="tel" value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder={t("authPhoneBindPlaceholder")} className="bg-white" />
          <div className="flex gap-2">
            <Input type="text" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authPhoneCodePlaceholder")} maxLength={6}
              className="flex-1 bg-white tracking-widest" />
            <button type="button" className={btnSend} disabled={loading || countdown > 0}
              onClick={() => handleSendCode("bind")}>
              {sendLabel()}
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnBlue} disabled={loading || !phone || !code} onClick={handleBind}>
              {t("authPhoneBind")}
            </button>
            <button type="button" className={btnPlain} onClick={() => { setView("idle"); resetState(); }}>
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {view === "rebinding" && (
        <div className="mt-3 sm:pl-14 space-y-2 animate-fade-in max-w-md">
          <Input type="tel" value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder={t("authPhoneNewPlaceholder")} className="bg-white" />
          <div className="flex gap-2">
            <Input type="text" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authPhoneCodePlaceholder")} maxLength={6}
              className="flex-1 bg-white tracking-widest" />
            <button type="button" className={btnSend} disabled={loading || countdown > 0}
              onClick={() => handleSendCode("rebind")}>
              {sendLabel()}
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnBlue} disabled={loading || !phone || !code} onClick={handleRebind}>
              {t("authPhoneRebindConfirm")}
            </button>
            <button type="button" className={btnPlain} onClick={() => { setView("idle"); resetState(); }}>
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {view === "unbinding" && (
        <div className="mt-3 sm:pl-14 space-y-2 animate-fade-in max-w-md">
          <p className="text-xs text-muted-foreground">
            {t("authPhoneUnbindHint")}: <span className="font-mono font-medium text-foreground">{currentPhone}</span>
          </p>
          <div className="flex gap-2">
            <Input type="text" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authPhoneCodePlaceholder")} maxLength={6}
              className="flex-1 bg-white tracking-widest" />
            <button type="button" className={btnSend} disabled={loading || countdown > 0}
              onClick={() => handleSendCode("unbind")}>
              {sendLabel()}
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnRed} disabled={loading || !code} onClick={handleUnbind}>
              {t("authPhoneUnbindConfirm")}
            </button>
            <button type="button" className={btnPlain} onClick={() => { setView("idle"); resetState(); }}>
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={`mt-2 sm:pl-14 text-xs font-medium ${isError ? "text-danger-600" : "text-success-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

PhoneBinding.displayName = "PhoneBinding";
