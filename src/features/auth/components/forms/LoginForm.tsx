/**
 * 登录表单
 * Login Form
 *
 * @module features/auth/components/forms/LoginForm
 */
import { Input, Button } from "@/shared/ui";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/passwordPolicy";
import { useLocale } from "@/core/i18n";

export interface LoginFormProps {
  loginForm: { identifier: string; password: string };
  setLoginForm: React.Dispatch<React.SetStateAction<{ identifier: string; password: string }>>;
  authError: string;
  onForgotPassword: (email: string) => void;
}

export function LoginForm({
  loginForm,
  setLoginForm,
  authError,
  onForgotPassword,
}: LoginFormProps) {
  const { t } = useLocale();

  return (
    <div className="space-y-3">
      <Input
        type="text"
        inputMode={/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginForm.identifier) ? "email" : "text"}
        value={loginForm.identifier}
        onChange={(e) => setLoginForm({ ...loginForm, identifier: e.target.value })}
        placeholder={t("authPhoneLoginPlaceholder") || "请输入手机号或邮箱"}
        autoComplete="username"
      />
      <Input
        type="password"
        value={loginForm.password}
        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
        placeholder={t("authPasswordPlaceholder")}
        minLength={PASSWORD_MIN_LENGTH}
      />
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={() => onForgotPassword(loginForm.identifier.trim())}
        className="px-0 text-slate-500 hover:text-slate-700 underline"
      >
        {t("authForgotLink")}
      </Button>
      {authError && (
        <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
          {authError}
        </p>
      )}
      <Button
        type="submit"
        variant="dark"
        className="w-full py-3 rounded-xl text-sm font-black"
      >
        {t("authLoginSubmit")}
      </Button>
    </div>
  );
}
