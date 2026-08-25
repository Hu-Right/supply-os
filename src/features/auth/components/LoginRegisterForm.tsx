/**
 * 登录/注册表单 — 模式切换容器
 * Login / Register Form — Mode Switching Container
 *
 * @module features/auth/components/LoginRegisterForm
 * @description 账号弹窗的登录/注册表单区块：模式切换、找回密码视图切换。
 *              具体表单逻辑已拆分至 hooks/ 和 forms/ 子模块。
 */
import { useState } from "react";
import { useAuthForm } from "../hooks/useAuthForm";
import { useForgotPassword } from "../hooks/useForgotPassword";
import { useRegisterCode } from "../hooks/useRegisterCode";
import { useUnspscPrefCascade } from "../hooks/useUnspscPrefCascade";
import { LoginForm } from "./forms/LoginForm";
import { RegisterForm } from "./forms/RegisterForm";
import { ForgotPasswordForm } from "./forms/ForgotPasswordForm";
import { useLocale } from "@/core/i18n";

export interface LoginRegisterFormProps {
  onSuccess: () => void;
}

export function LoginRegisterForm({ onSuccess }: LoginRegisterFormProps) {
  const { t } = useLocale();
  const [forgotView, setForgotView] = useState(false);

  const auth = useAuthForm(onSuccess);
  const forgot = useForgotPassword(onSuccess);
  const registerCode = useRegisterCode();
  const cascade = useUnspscPrefCascade();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotView) {
      if (forgot.forgotStep === 1) {
        await forgot.handleSendResetCode(e);
      } else {
        await forgot.handleResetPassword(e);
      }
    } else {
      await auth.submitAuth(
        registerCode.registerVerifyCode,
        registerCode.registerCodeSent,
        cascade.prefLevel1 || null,
        cascade.prefLevel2 || null,
        cascade.prefLevel3 || null,
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Login / Register toggle */}
      {!forgotView && (
        <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => auth.setAuthMode("login")}
            className={`py-2.5 rounded-lg text-sm font-black ${
              auth.authMode === "login"
                ? "bg-white shadow-xs text-slate-900"
                : "text-slate-500"
            }`}
          >
            {t("authLoginTab")}
          </button>
          <button
            type="button"
            onClick={() => auth.setAuthMode("register")}
            className={`py-2.5 rounded-lg text-sm font-black ${
              auth.authMode === "register"
                ? "bg-white shadow-xs text-slate-900"
                : "text-slate-500"
            }`}
          >
            {t("authRegisterTab")}
          </button>
        </div>
      )}

      {/* 找回密码视图 */}
      {forgotView && (
        <ForgotPasswordForm
          forgot={forgot}
          onBack={() => setForgotView(false)}
        />
      )}

      {/* 登录 / 注册表单 */}
      {!forgotView && auth.authMode === "login" && (
        <LoginForm
          authForm={auth.authForm}
          setAuthForm={auth.setAuthForm}
          authError={auth.authError}
          claimMessage={auth.claimMessage}
          onForgotPassword={(email) => {
            forgot.setForgotEmail(email);
            auth.setAuthError("");
            setForgotView(true);
          }}
        />
      )}

      {!forgotView && auth.authMode === "register" && (
        <RegisterForm
          authForm={auth.authForm}
          setAuthForm={auth.setAuthForm}
          claimForm={auth.claimForm}
          setClaimForm={auth.setClaimForm}
          authError={auth.authError}
          registerCode={registerCode}
          cascade={cascade}
        />
      )}
    </form>
  );
}
