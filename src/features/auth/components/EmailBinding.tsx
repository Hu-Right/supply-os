/**
 * 邮箱绑定组件
 * Email Binding Component
 *
 * @module features/auth/components/EmailBinding
 * @description 用户邮箱绑定 / 解绑管理面板。
 *              逻辑已提取至 useEmailBinding hook。
 */
import { Mail, ShieldCheck, Unlink } from "lucide-react";
import { Button, Input } from "@/shared/ui";
import { useEmailBinding } from "../hooks/useEmailBinding";

export function EmailBinding() {
  const {
    t, view, setView, email, setEmail, code, setCode,
    message, isError, loading, countdown,
    hasEmail, currentEmail, isVerified,
    handleSendCode, handleBind, handleUnbind, resetState,
  } = useEmailBinding();

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-blue-600" />
        <h4 className="text-sm font-extrabold text-slate-900">{t("authEmailTitle") || "邮箱绑定"}</h4>
        {hasEmail && isVerified && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            <ShieldCheck className="w-3 h-3" />
            {t("authEmailVerified") || "已验证"}
          </span>
        )}
      </div>

      {/* 已绑定状态 */}
      {hasEmail && view === "idle" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            {t("authEmailBound") || "已绑定邮箱"}: <span className="font-mono font-bold text-slate-900">{currentEmail}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setView("unbinding"); resetState(); }}
            className="bg-white border-rose-200 text-rose-600 hover:bg-rose-50 gap-1"
          >
            <Unlink className="w-3 h-3" />
            {t("authEmailUnbind") || "解绑邮箱"}
          </Button>
        </div>
      )}

      {/* 未绑定状态 */}
      {!hasEmail && view === "idle" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">{t("authEmailNotBound") || "尚未绑定邮箱，绑定后可通过邮箱验证码找回密码"}</p>
          <Button
            type="button"
            variant="primary"
            onClick={() => { setView("binding"); resetState(); }}
            className="py-2 text-xs font-black"
          >
            {t("authEmailBindAction") || "绑定邮箱"}
          </Button>
        </div>
      )}

      {/* 绑定表单 */}
      {view === "binding" && (
        <div className="space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
            placeholder={t("authEmailBindPlaceholder") || "请输入邮箱地址"}
            className="bg-white"
          />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {t("authEmailBindConsent") || "绑定邮箱即视为同意我们向您发送营销信息"}
          </p>
          <div className="flex gap-2">
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authEmailCodePlaceholder") || "请输入 6 位验证码"}
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
              {countdown > 0 ? `${countdown}s` : loading ? (t("authForgotSending") || "发送中…") : (t("authEmailSendCode") || "发送验证码")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={loading || !email || !code}
              onClick={handleBind}
              className="py-2 text-xs font-black"
            >
              {t("authEmailBind") || "确认绑定"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setView("idle"); resetState(); }}
              className="py-2 text-xs bg-white"
            >
              {t("cancel") || "取消"}
            </Button>
          </div>
        </div>
      )}

      {/* 解绑表单 */}
      {view === "unbinding" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            {t("authEmailUnbindHint") || "验证码将发送到当前绑定的邮箱"}: <span className="font-mono font-bold">{currentEmail}</span>
          </p>
          <div className="flex gap-2">
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authEmailCodePlaceholder") || "请输入 6 位验证码"}
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
              {countdown > 0 ? `${countdown}s` : loading ? (t("authForgotSending") || "发送中…") : (t("authEmailSendCode") || "发送验证码")}
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
              {t("authEmailUnbindConfirm") || "确认解绑"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setView("idle"); resetState(); }}
              className="py-2 text-xs bg-white"
            >
              {t("cancel") || "取消"}
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

EmailBinding.displayName = "EmailBinding";
