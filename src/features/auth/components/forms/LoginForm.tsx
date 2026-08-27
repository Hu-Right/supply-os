/**
 * 登录表单
 * Login Form
 *
 * @module features/auth/components/forms/LoginForm
 */
import { Input, Button } from "@/shared/ui";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/passwordPolicy";
import { useLocale } from "@/core/i18n";
import type { AuthFormState } from "../../hooks/useAuthForm";

export interface LoginFormProps {
  authForm: AuthFormState;
  setAuthForm: React.Dispatch<React.SetStateAction<AuthFormState>>;
  authError: string;
  claimMessage: string | null;
  onForgotPassword: (email: string) => void;
}

export function LoginForm({
  authForm,
  setAuthForm,
  authError,
  claimMessage,
  onForgotPassword,
}: LoginFormProps) {
  const { t } = useLocale();

  return (
    <div className="space-y-3">
      <Input
        type="text"
        inputMode="text"
        value={authForm.email}
        onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
        placeholder={t("authEmailOrPhonePlaceholder")}
        autoComplete="username"
      />
      <Input
        type="password"
        value={authForm.password}
        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
        placeholder={t("authPasswordPlaceholder")}
        minLength={PASSWORD_MIN_LENGTH}
      />
      <button
        type="button"
        onClick={() => onForgotPassword(authForm.email.trim())}
        className="text-xs text-slate-500 hover:text-slate-700 underline"
      >
        {t("authForgotLink")}
      </button>
      {authError && (
        <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
          {authError}
        </p>
      )}
      {claimMessage && (
        <p className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg p-3">
          {claimMessage}
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
