/**
 * 登录/注册表单 — 模式切换容器
 * Login / Register Form — Mode Switching Container
 *
 * @module features/auth/components/LoginRegisterForm
 * @description 账号弹窗的登录/注册表单区块：模式切换、找回密码视图切换。
 *              具体表单逻辑已拆分至 hooks/ 和 forms/ 子模块。
 */
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useAuthForm } from "../hooks/useAuthForm";
import { useForgotPassword } from "../hooks/useForgotPassword";
import { useRegisterCode } from "../hooks/useRegisterCode";
import { useUnspscPrefCascade } from "../hooks/useUnspscPrefCascade";
import { LoginForm } from "./forms/LoginForm";
import { ForgotPasswordForm } from "./forms/ForgotPasswordForm";
import { useLocale } from "@/core/i18n";
import { SegmentedControl } from "@/shared/ui";

/** 注册表单按需加载：仅切换到注册模式时才拉取，避免登录模式下无用加载 */
const RegisterForm = dynamic(() => import("./forms/RegisterForm").then((m) => m.RegisterForm), {
  ssr: false,
});

export interface LoginRegisterFormProps {
  onSuccess: () => void;
  /** 初始模式（默认登录）；扫码推广场景传 register */
  initialMode?: "login" | "register";
}

export function LoginRegisterForm({ onSuccess, initialMode }: LoginRegisterFormProps) {
  const { t } = useLocale();
  const [forgotView, setForgotView] = useState(false);
  const [qualificationData, setQualificationData] = useState<Record<string, string | string[]> | null>(null);
  // ★ 用 ref 存储最新 qualificationData，避免 useEffect 异步传播时序竞态
  // （EnterpriseQualificationForm 通过 useEffect 回调更新 state，提交时 state 可能尚未更新）
  // 直接在回调中同步更新 ref，不依赖 useEffect 的异步传播
  const qualificationDataRef = useRef(qualificationData);

  const handleQualificationDataChange = (data: Record<string, string | string[]> | null) => {
    qualificationDataRef.current = data;
    setQualificationData(data);
  };

  const auth = useAuthForm(onSuccess, initialMode);
  const forgot = useForgotPassword(onSuccess);
  const registerCode = useRegisterCode();
  const cascade = useUnspscPrefCascade();

  // ★ 修复：切换到注册模式时重置级联状态，防止上一个账号的行业偏好残留
  // 依赖仅使用 cascade.resetCascade（稳定 useCallback 引用），不依赖整个 cascade 对象，
  // 避免 useUnspscPrefCascade 的 useMemo 因 state 变化产生新引用时反复触发 resetCascade。
  useEffect(() => {
    if (auth.authMode === "register") {
      cascade.resetCascade();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.authMode, cascade.resetCascade]);

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
        qualificationDataRef.current,
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Login / Register toggle */}
      {!forgotView && (
        <SegmentedControl
          fullWidth
          value={auth.authMode}
          onChange={(mode) => auth.setAuthMode(mode)}
          items={[
            { value: "login", label: t("authLoginTab") },
            { value: "register", label: t("authRegisterTab") },
          ]}
        />
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
          onForgotPassword={(identifier) => {
            forgot.setForgotIdentifier(identifier);
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
          onQualificationChange={handleQualificationDataChange}
          agreedToTerms={auth.agreedToTerms}
          setAgreedToTerms={auth.setAgreedToTerms}
        />
      )}
    </form>
  );
}
