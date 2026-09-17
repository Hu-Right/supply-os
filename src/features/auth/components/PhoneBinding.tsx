/**
 * 手机号绑定组件 — 极简行式
 * Phone Binding Component
 *
 * @module features/auth/components/PhoneBinding
 * @description 用户手机号绑定 / 换绑 / 解绑管理行。行头：图标 + 标题/ masked 值 +
 *              右侧操作；编辑态行内展开。逻辑在 usePhoneBinding hook。
 */
import { Smartphone, ShieldCheck, Unlink } from "lucide-react";
import { Button, Input } from "@/shared/ui";
import { usePhoneBinding } from "../hooks/usePhoneBinding";

export function PhoneBinding() {
  const {
    t, view, setView, phone, setPhone, code, setCode,
    message, isError, loading, countdown,
    hasPhone, currentPhone, isVerified,
    handleSendCode, handleBind, handleRebind, handleUnbind, resetState,
  } = usePhoneBinding();

  return (
    <div className="px-5 py-4">
      {/* 行头 */}
      <div className="flex items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
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
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {hasPhone ? <span className="font-mono">{currentPhone}</span> : t("authPhoneNotBound")}
          </p>
        </div>
        {hasPhone && view === "idle" && (
          <div className="flex gap-2 shrink-0">
            <Button type="button" variant="ghost" size="sm"
              onClick={() => { setView("rebinding"); resetState(); }}
              className="text-primary-600 hover:text-primary-700 hover:bg-primary-50">
              {t("authPhoneRebind")}
            </Button>
            <Button type="button" variant="ghost" size="sm"
              onClick={() => { setView("unbinding"); resetState(); }}
              className="text-danger-600 hover:text-danger-700 hover:bg-danger-50 gap-1">
              <Unlink className="w-3.5 h-3.5" />
              {t("authPhoneUnbind")}
            </Button>
          </div>
        )}
        {!hasPhone && view === "idle" && (
          <Button type="button" variant="primary" size="sm"
            onClick={() => { setView("binding"); resetState(); }}>
            {t("authPhoneBindAction")}
          </Button>
        )}
      </div>

      {/* 绑定表单 */}
      {view === "binding" && (
        <div className="mt-3 sm:pl-14 space-y-2 animate-fade-in">
          <Input type="tel" value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder={t("authPhoneBindPlaceholder")} className="bg-white" />
          <div className="flex gap-2">
            <Input type="text" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authPhoneCodePlaceholder")} maxLength={6}
              className="flex-1 bg-white tracking-widest" />
            <Button type="button" variant="outline" size="sm" disabled={loading || countdown > 0}
              onClick={() => handleSendCode("bind")}
              className="shrink-0 bg-white text-primary-600 border-border hover:bg-primary-50 whitespace-nowrap">
              {countdown > 0 ? `${countdown}s` : loading ? t("authForgotSending") : t("authPhoneSendCode")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="primary" size="sm" disabled={loading || !phone || !code} onClick={handleBind}>
              {t("authPhoneBind")}
            </Button>
            <Button type="button" variant="outline" size="sm"
              onClick={() => { setView("idle"); resetState(); }} className="bg-white">
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* 换绑表单 */}
      {view === "rebinding" && (
        <div className="mt-3 sm:pl-14 space-y-2 animate-fade-in">
          <Input type="tel" value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder={t("authPhoneNewPlaceholder")} className="bg-white" />
          <div className="flex gap-2">
            <Input type="text" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authPhoneCodePlaceholder")} maxLength={6}
              className="flex-1 bg-white tracking-widest" />
            <Button type="button" variant="outline" size="sm" disabled={loading || countdown > 0}
              onClick={() => handleSendCode("rebind")}
              className="shrink-0 bg-white text-primary-600 border-border hover:bg-primary-50 whitespace-nowrap">
              {countdown > 0 ? `${countdown}s` : loading ? t("authForgotSending") : t("authPhoneSendCode")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="primary" size="sm" disabled={loading || !phone || !code} onClick={handleRebind}>
              {t("authPhoneRebindConfirm")}
            </Button>
            <Button type="button" variant="outline" size="sm"
              onClick={() => { setView("idle"); resetState(); }} className="bg-white">
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* 解绑表单 */}
      {view === "unbinding" && (
        <div className="mt-3 sm:pl-14 space-y-2 animate-fade-in">
          <p className="text-xs text-muted-foreground">
            {t("authPhoneUnbindHint")}: <span className="font-mono font-medium text-foreground">{currentPhone}</span>
          </p>
          <div className="flex gap-2">
            <Input type="text" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authPhoneCodePlaceholder")} maxLength={6}
              className="flex-1 bg-white tracking-widest" />
            <Button type="button" variant="outline" size="sm" disabled={loading || countdown > 0}
              onClick={() => handleSendCode("unbind")}
              className="shrink-0 bg-white text-primary-600 border-border hover:bg-primary-50 whitespace-nowrap">
              {countdown > 0 ? `${countdown}s` : loading ? t("authForgotSending") : t("authPhoneSendCode")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="danger" size="sm" disabled={loading || !code} onClick={handleUnbind}>
              {t("authPhoneUnbindConfirm")}
            </Button>
            <Button type="button" variant="outline" size="sm"
              onClick={() => { setView("idle"); resetState(); }} className="bg-white">
              {t("cancel")}
            </Button>
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
