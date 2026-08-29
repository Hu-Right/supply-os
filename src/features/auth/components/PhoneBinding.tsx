/**
 * 手机号绑定组件
 * Phone Binding Component
 *
 * @module features/auth/components/PhoneBinding
 * @description 用户手机号绑定 / 换绑 / 解绑管理面板。
 *              逻辑已提取至 usePhoneBinding hook。
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
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-teal-600" />
        <h4 className="text-sm font-extrabold text-slate-900">{t("authPhoneTitle")}</h4>
        {hasPhone && isVerified && (
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
            {t("authPhoneBound")}: <span className="font-mono font-bold text-slate-900">{currentPhone}</span>
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setView("rebinding"); resetState(); }}
              className="bg-white text-slate-700 hover:bg-slate-100"
            >
              {t("authPhoneRebind")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setView("unbinding"); resetState(); }}
              className="bg-white border-rose-200 text-rose-600 hover:bg-rose-50 gap-1"
            >
              <Unlink className="w-3 h-3" />
              {t("authPhoneUnbind")}
            </Button>
          </div>
        </div>
      )}

      {/* 未绑定状态 */}
      {!hasPhone && view === "idle" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">{t("authPhoneNotBound")}</p>
          <Button
            type="button"
            variant="primary"
            onClick={() => { setView("binding"); resetState(); }}
            className="py-2 text-xs font-black"
          >
            {t("authPhoneBindAction")}
          </Button>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || countdown > 0}
              onClick={() => handleSendCode("bind")}
              className="shrink-0 py-2 border-teal-200 text-teal-600 hover:bg-teal-50 whitespace-nowrap"
            >
              {countdown > 0 ? `${countdown}s` : loading ? t("authForgotSending") : t("authPhoneSendCode")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={loading || !phone || !code}
              onClick={handleBind}
              className="py-2 text-xs font-black"
            >
              {t("authPhoneBind")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setView("idle"); resetState(); }}
              className="py-2 text-xs bg-white"
            >
              {t("cancel")}
            </Button>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || countdown > 0}
              onClick={() => handleSendCode("rebind")}
              className="shrink-0 py-2 border-teal-200 text-teal-600 hover:bg-teal-50 whitespace-nowrap"
            >
              {countdown > 0 ? `${countdown}s` : loading ? t("authForgotSending") : t("authPhoneSendCode")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={loading || !phone || !code}
              onClick={handleRebind}
              className="py-2 text-xs font-black"
            >
              {t("authPhoneRebindConfirm")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setView("idle"); resetState(); }}
              className="py-2 text-xs bg-white"
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* 解绑表单 */}
      {view === "unbinding" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            {t("authPhoneUnbindHint")}: <span className="font-mono font-bold">{currentPhone}</span>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || countdown > 0}
              onClick={() => handleSendCode("unbind")}
              className="shrink-0 py-2 border-teal-200 text-teal-600 hover:bg-teal-50 whitespace-nowrap"
            >
              {countdown > 0 ? `${countdown}s` : loading ? t("authForgotSending") : t("authPhoneSendCode")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="danger"
              disabled={loading || !code}
              onClick={handleUnbind}
              className="py-2 text-xs font-black"
            >
              {t("authPhoneUnbindConfirm")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setView("idle"); resetState(); }}
              className="py-2 text-xs bg-white"
            >
              {t("cancel")}
            </Button>
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
