/**
 * 邮箱绑定行 — 智谱行式（实心圆图标 + 右侧实心蓝/红按钮）
 * Email Binding Row
 *
 * @module features/auth/components/EmailBinding
 * @description 安全设置行：实心品牌圆图标 + 标题/ masked 值灰描述 + 右侧实心
 *              「解绑/绑定」；编辑态行内展开。逻辑在 useEmailBinding。
 */
import { Mail, ShieldCheck } from "lucide-react";
import { Input } from "@/shared/ui";
import { useEmailBinding } from "../hooks/useEmailBinding";

const btnBlue = "px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0 disabled:opacity-50";
const btnRed = "px-4 py-1.5 rounded-md bg-danger-600 text-white text-xs font-medium hover:bg-danger-700 transition-colors shrink-0 disabled:opacity-50";
const btnPlain = "px-4 py-1.5 rounded-md bg-white border border-border text-xs font-medium text-foreground hover:bg-secondary-50 transition-colors shrink-0";
const btnSend = "px-3 py-1.5 rounded-md bg-white border border-border text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors shrink-0 whitespace-nowrap disabled:opacity-50";

export function EmailBinding() {
  const {
    t, view, setView, email, setEmail, code, setCode,
    message, isError, loading, countdown,
    hasEmail, currentEmail, isVerified,
    handleSendCode, handleBind, handleUnbind, resetState,
  } = useEmailBinding();

  const sendLabel = () =>
    countdown > 0 ? `${countdown}s` : loading ? (t("authForgotSending") || "发送中…") : (t("authEmailSendCode") || "发送验证码");

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-brand-500 text-white flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{t("authEmailTitle") || "邮箱绑定"}</p>
            {hasEmail && isVerified && (
              <span className="inline-flex items-center gap-1 text-2xs font-medium text-success-600">
                <ShieldCheck className="w-3 h-3" />
                {t("authEmailVerified") || "已验证"}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {hasEmail ? <span className="font-mono">{currentEmail}</span> : (t("authEmailNotBound") || "尚未绑定邮箱")}
          </p>
        </div>
        {hasEmail && view === "idle" && (
          <button type="button" className={btnRed}
            onClick={() => { setView("unbinding"); resetState(); }}>
            {t("authEmailUnbind") || "解绑"}
          </button>
        )}
        {!hasEmail && view === "idle" && (
          <button type="button" className={btnBlue}
            onClick={() => { setView("binding"); resetState(); }}>
            {t("authEmailBindAction") || "绑定"}
          </button>
        )}
      </div>

      {view === "binding" && (
        <div className="mt-3 sm:pl-14 space-y-2 animate-fade-in max-w-md">
          <Input type="email" value={email}
            onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
            placeholder={t("authEmailBindPlaceholder") || "请输入邮箱地址"} className="bg-white" />
          <p className="text-2xs text-muted-foreground leading-relaxed">
            {t("authEmailBindConsent") || "绑定邮箱即视为同意我们向您发送营销信息"}
          </p>
          <div className="flex gap-2">
            <Input type="text" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authEmailCodePlaceholder") || "请输入 6 位验证码"} maxLength={6}
              className="flex-1 bg-white tracking-widest" />
            <button type="button" className={btnSend} disabled={loading || countdown > 0}
              onClick={() => handleSendCode("bind")}>
              {sendLabel()}
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnBlue} disabled={loading || !email || !code} onClick={handleBind}>
              {t("authEmailBind") || "确认绑定"}
            </button>
            <button type="button" className={btnPlain} onClick={() => { setView("idle"); resetState(); }}>
              {t("cancel") || "取消"}
            </button>
          </div>
        </div>
      )}

      {view === "unbinding" && (
        <div className="mt-3 sm:pl-14 space-y-2 animate-fade-in max-w-md">
          <p className="text-xs text-muted-foreground">
            {t("authEmailUnbindHint") || "验证码将发送到当前绑定的邮箱"}: <span className="font-mono font-medium text-foreground">{currentEmail}</span>
          </p>
          <div className="flex gap-2">
            <Input type="text" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authEmailCodePlaceholder") || "请输入 6 位验证码"} maxLength={6}
              className="flex-1 bg-white tracking-widest" />
            <button type="button" className={btnSend} disabled={loading || countdown > 0}
              onClick={() => handleSendCode("unbind")}>
              {sendLabel()}
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnRed} disabled={loading || !code} onClick={handleUnbind}>
              {t("authEmailUnbindConfirm") || "确认解绑"}
            </button>
            <button type="button" className={btnPlain} onClick={() => { setView("idle"); resetState(); }}>
              {t("cancel") || "取消"}
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

EmailBinding.displayName = "EmailBinding";
