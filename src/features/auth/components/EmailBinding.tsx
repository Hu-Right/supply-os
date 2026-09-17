/**
 * 邮箱绑定组件 — 极简行式
 * Email Binding Component
 *
 * @module features/auth/components/EmailBinding
 * @description 用户邮箱绑定 / 解绑管理行。行头：图标 + 标题/ masked 值 + 右侧操作；
 *              编辑态行内展开。逻辑在 useEmailBinding hook。
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
    <div className="px-5 py-4">
      {/* 行头 */}
      <div className="flex items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
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
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {hasEmail ? <span className="font-mono">{currentEmail}</span> : (t("authEmailNotBound") || "尚未绑定邮箱")}
          </p>
        </div>
        {hasEmail && view === "idle" && (
          <Button type="button" variant="ghost" size="sm"
            onClick={() => { setView("unbinding"); resetState(); }}
            className="text-danger-600 hover:text-danger-700 hover:bg-danger-50 gap-1">
            <Unlink className="w-3.5 h-3.5" />
            {t("authEmailUnbind") || "解绑"}
          </Button>
        )}
        {!hasEmail && view === "idle" && (
          <Button type="button" variant="primary" size="sm"
            onClick={() => { setView("binding"); resetState(); }}>
            {t("authEmailBindAction") || "绑定"}
          </Button>
        )}
      </div>

      {/* 绑定表单 */}
      {view === "binding" && (
        <div className="mt-3 sm:pl-14 space-y-2 animate-fade-in">
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
            <Button type="button" variant="outline" size="sm" disabled={loading || countdown > 0}
              onClick={() => handleSendCode("bind")}
              className="shrink-0 bg-white text-primary-600 border-border hover:bg-primary-50 whitespace-nowrap">
              {countdown > 0 ? `${countdown}s` : loading ? (t("authForgotSending") || "发送中…") : (t("authEmailSendCode") || "发送验证码")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="primary" size="sm" disabled={loading || !email || !code} onClick={handleBind}>
              {t("authEmailBind") || "确认绑定"}
            </Button>
            <Button type="button" variant="outline" size="sm"
              onClick={() => { setView("idle"); resetState(); }} className="bg-white">
              {t("cancel") || "取消"}
            </Button>
          </div>
        </div>
      )}

      {/* 解绑表单 */}
      {view === "unbinding" && (
        <div className="mt-3 sm:pl-14 space-y-2 animate-fade-in">
          <p className="text-xs text-muted-foreground">
            {t("authEmailUnbindHint") || "验证码将发送到当前绑定的邮箱"}: <span className="font-mono font-medium text-foreground">{currentEmail}</span>
          </p>
          <div className="flex gap-2">
            <Input type="text" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authEmailCodePlaceholder") || "请输入 6 位验证码"} maxLength={6}
              className="flex-1 bg-white tracking-widest" />
            <Button type="button" variant="outline" size="sm" disabled={loading || countdown > 0}
              onClick={() => handleSendCode("unbind")}
              className="shrink-0 bg-white text-primary-600 border-border hover:bg-primary-50 whitespace-nowrap">
              {countdown > 0 ? `${countdown}s` : loading ? (t("authForgotSending") || "发送中…") : (t("authEmailSendCode") || "发送验证码")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="danger" size="sm" disabled={loading || !code} onClick={handleUnbind}>
              {t("authEmailUnbindConfirm") || "确认解绑"}
            </Button>
            <Button type="button" variant="outline" size="sm"
              onClick={() => { setView("idle"); resetState(); }} className="bg-white">
              {t("cancel") || "取消"}
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

EmailBinding.displayName = "EmailBinding";
