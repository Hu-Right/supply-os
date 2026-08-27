/**
 * 找回密码表单
 * Forgot Password Form
 *
 * @module features/auth/components/forms/ForgotPasswordForm
 */
import { Input, Button } from "@/shared/ui";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/passwordPolicy";
import { Mail } from "lucide-react";
import type { useForgotPassword } from "../../hooks/useForgotPassword";

export interface ForgotPasswordFormProps {
  forgot: ReturnType<typeof useForgotPassword>;
  onBack: () => void;
}

export function ForgotPasswordForm({ forgot, onBack }: ForgotPasswordFormProps) {
  const {
    t,
    forgotStep,
    setForgotStep,
    forgotEmail,
    setForgotEmail,
    forgotCode,
    setForgotCode,
    forgotNewPassword,
    setForgotNewPassword,
    forgotLoading,
    forgotError,
    setForgotError,
    forgotSuccess,
    showSupportHint,
    handleSendResetCode,
    handleResetPassword,
    reset,
    maskEmail,
    maskPhone,
    detectChannel,
  } = forgot;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-extrabold text-slate-900 text-center">
        {t("authForgotTitle")}
      </h4>

      {forgotStep === 1 ? (
        /* 步骤 1：输入邮箱/手机号 */
        <div className="space-y-3">
          <Input
            type="text"
            inputMode="text"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            placeholder={t("authForgotIdentifierPlaceholder") || "邮箱 / 手机号"}
            autoComplete="username"
          />
          {forgotEmail.trim() && (() => {
            const detected = detectChannel(forgotEmail.trim());
            return (
              <p className="text-[11px] text-slate-400">
                {detected === "sms"
                  ? (t("authForgotDetectSms") || "已识别为手机号，将通过短信验证")
                  : (t("authForgotDetectEmail") || "已识别为邮箱，将通过邮件验证")}
              </p>
            );
          })()}
          <Button
            type="button"
            variant="dark"
            loading={forgotLoading}
            className="w-full py-3 rounded-xl text-sm font-black"
            onClick={handleSendResetCode}
          >
            {forgotLoading ? t("authForgotSending") : t("authForgotSendCode")}
          </Button>
        </div>
      ) : (
        /* 步骤 2：输入验证码 + 新密码 */
        <div className="space-y-3">
          <p className="text-xs text-slate-500 text-center">
            {t("authForgotCodeHint")} {detectChannel(forgotEmail) === "sms" ? maskPhone(forgotEmail) : maskEmail(forgotEmail)}
          </p>
          <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
            <p className="text-xs text-blue-700">
              {t("authForgotConfirmAccount") || "请确认这是您的账号。如果验证码发送到了他人的账号，您将无法收到验证码。"}
            </p>
          </div>
          <Input
            type="text"
            value={forgotCode}
            onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={t("authForgotCodePlaceholder")}
            maxLength={6}
            className="text-center text-lg tracking-widest"
          />
          <Input
            type="password"
            value={forgotNewPassword}
            onChange={(e) => setForgotNewPassword(e.target.value)}
            placeholder={t("authForgotNewPasswordPlaceholder")}
            minLength={PASSWORD_MIN_LENGTH}
          />
          <Button
            type="button"
            variant="dark"
            loading={forgotLoading}
            className="w-full py-3 rounded-xl text-sm font-black"
            onClick={handleResetPassword}
          >
            {forgotLoading ? t("authForgotResetting") : t("authForgotResetSubmit")}
          </Button>
          <button
            type="button"
            onClick={() => {
              setForgotStep(1);
              setForgotCode("");
              setForgotNewPassword("");
              setForgotError("");
            }}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-700"
          >
            {t("authForgotChangeAccount") || "信息有误？返回修改"}
          </button>
        </div>
      )}

      {/* 错误 / 成功提示 */}
      {forgotError && (
        <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
          {forgotError}
        </p>
      )}
      {forgotSuccess && (
        <p className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg p-3">
          {forgotSuccess}
        </p>
      )}

      {/* 客服申诉入口 */}
      {showSupportHint && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs font-bold text-amber-700 mb-1.5">
            {t("authForgotCantReceive") || "无法收到验证码？"}
          </p>
          <p className="text-xs text-amber-600 mb-2">
            {t("authForgotContactSupport") || "如注册时使用了非真实邮箱，请联系客服协助重置密码"}
          </p>
          <a
            href="mailto:support@supply-os.com"
            className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 hover:text-teal-700 hover:underline"
          >
            <Mail className="w-3.5 h-3.5" />
            {t("authForgotEmailSupport") || "发送邮件至客服"}
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          reset();
          onBack();
        }}
        className="w-full text-center text-xs text-slate-500 hover:text-slate-700"
      >
        ← {t("authForgotBackToLogin")}
      </button>
    </div>
  );
}
