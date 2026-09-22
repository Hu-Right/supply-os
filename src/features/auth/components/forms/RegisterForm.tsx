/**
 * 注册表单
 * Register Form
 *
 * @module features/auth/components/forms/RegisterForm
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { Input, Button } from "@/shared/ui";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/passwordPolicy";
import { useLocale } from "@/core/i18n";
import type { AuthFormState } from "../../hooks/useAuthForm";
import type { useRegisterCode } from "../../hooks/useRegisterCode";

export interface RegisterFormProps {
  authForm: AuthFormState;
  setAuthForm: React.Dispatch<React.SetStateAction<AuthFormState>>;
  authError: string;
  registerCode: ReturnType<typeof useRegisterCode>;
  /** 用户是否已勾选同意协议 */
  agreedToTerms: boolean;
  /** 设置同意协议状态 */
  setAgreedToTerms: (value: boolean) => void;
}

export function RegisterForm({
  authForm,
  setAuthForm,
  authError,
  registerCode,
  agreedToTerms,
  setAgreedToTerms,
}: RegisterFormProps) {
  const { t } = useLocale();

  // ★ 检测推荐链接 Cookie：SSR 返回 false，客户端 mount 后检测真实值，避免 hydration mismatch
  const [hasRefCookie, setHasRefCookie] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    setHasRefCookie(/(?:^|;\s*)ref_code=/.test(document.cookie));
  }, []);

  return (
    <div className="space-y-3">
      {/* 姓名（必填） */}
      <div className="space-y-1">
        <Input
          type="text"
          value={authForm.displayName}
          onChange={(e) => setAuthForm({ ...authForm, displayName: e.target.value })}
          placeholder={t("authDisplayNamePlaceholder") || "请输入您的姓名"}
          autoComplete="name"
        />
      </div>

      {/* 手机号 */}
      <div className="space-y-1">
        <Input
          type="tel"
          inputMode="tel"
          value={authForm.phone}
          onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value.replace(/\D/g, "").slice(0, 11) })}
          placeholder={t("authPhonePlaceholder") || "请输入手机号"}
          autoComplete="tel"
        />
      </div>
      <div className="space-y-1">
        <div className="flex gap-2">
          <Input
            type="text"
            value={registerCode.registerVerifyCode}
            onChange={(e) => registerCode.setRegisterVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={t("authSmsCodePlaceholder") || "短信验证码"}
            maxLength={6}
            className="flex-1 tracking-widest"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => registerCode.handleSendSmsCode(authForm.phone.trim())}
            disabled={registerCode.registerCodeLoading || registerCode.registerCodeCountdown > 0}
            className="shrink-0 py-2 border-teal-200 text-teal-600 hover:bg-teal-50 whitespace-nowrap"
          >
            {registerCode.registerCodeCountdown > 0
              ? `${registerCode.registerCodeCountdown}s`
              : registerCode.registerCodeLoading
                ? t("authForgotSending")
                : t("authRegisterSendSmsCode") || "获取验证码"}
          </Button>
        </div>
        {registerCode.registerCodeError && (
          <p className="text-xs font-bold text-rose-600">{registerCode.registerCodeError}</p>
        )}
        {registerCode.registerCodeSent && registerCode.registerCodeCountdown <= 0 && (
          <p className="text-xs text-teal-600">{t("authSmsCodeSent") || "验证码已发送，请查收短信"}</p>
        )}
      </div>

      {/* 邮箱已从注册流程移除，用户可在个人中心独立绑定 */}
      <Input
        type="password"
        value={authForm.password}
        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
        placeholder={t("authPasswordPlaceholder")}
        minLength={PASSWORD_MIN_LENGTH}
      />

      {/* 邀请码（选填） */}
      <div>
        <Input
          type="text"
          value={authForm.invitationCode}
          onChange={(e) => setAuthForm({ ...authForm, invitationCode: e.target.value.toUpperCase() })}
          placeholder={t("authInvitationCodePlaceholder") || "请输入邀请码（选填）"}
          className="uppercase tracking-wider"
        />
        {authForm.invitationCode && hasRefCookie && (
          <p className="text-xs text-teal-600 mt-1 flex items-center gap-1">
            <span>✓</span> {t("authInvitationCodeAutoFilled") || "邀请码已由推荐链接自动填入"}
          </p>
        )}

      </div>

      {authError && (
        <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
          {authError}
        </p>
      )}

      {/* ── 法律协议勾选（P0 合规）：默认不勾选，用户必须主动勾选 ── */}
      <label className="flex items-start gap-2 text-xs text-slate-500 cursor-pointer select-none leading-relaxed">
        <input
          type="checkbox"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-teal-600"
        />
        <span>
          {t("authAgreeTermsPrefix")}
          {" "}
          <Link href="/terms" target="_blank" className="text-teal-600 underline hover:text-teal-700">
            {t("authAgreeTermsLink")}
          </Link>
          {" "}
          <Link href="/privacy" target="_blank" className="text-teal-600 underline hover:text-teal-700">
            {t("authAgreePrivacyLink")}
          </Link>
        </span>
      </label>

      <Button
        type="submit"
        variant="dark"
        className="w-full py-3 rounded-xl text-sm font-black"
      >
        {t("authRegisterSubmit")}
      </Button>
    </div>
  );
}
