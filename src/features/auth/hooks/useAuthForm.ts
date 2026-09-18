/**
 * 登录/注册表单 Hook
 * Login/Register Form Hook
 *
 * @module features/auth/hooks/useAuthForm
 */
import { useState, useEffect } from "react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { saveIndustryPrefs } from "@/core/api/industry-prefs";
import { validatePassword } from "@/shared/auth/passwordPolicy";
import { usePersistedFormState } from "@/shared/hooks/usePersistedFormState";

/** 草稿过期时间：3 天，超过后自动清除 */
export const DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export interface AuthFormState {
  displayName: string;
  identifier: string; // 登录用：手机号
  email: string; // 注册用：选填邮箱（仅用于通知，不作为登录凭证）
  phone: string; // 注册用：必填手机号
  password: string;
  invitationCode: string;
}

export function useAuthForm(onSuccess: () => void, initialMode: "login" | "register" = "login") {
  const { t } = useLocale();
  const { login, register } = useAuth();

  // 初始模式由调用方注入（扫码推广场景 layout-shell 传 "register"）
  const [authMode, setAuthMode] = useState<"login" | "register">(initialMode);
  const [authError, setAuthError] = useState("");
  /** 用户是否主动勾选同意协议（默认 false，不得预先勾选） */
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // ★ 登录态表单（不持久化，登录字段简短无需草稿恢复）
  const [loginForm, setLoginForm] = useState({ identifier: "", password: "" });

  // ★ 注册态表单 — localStorage 草稿持久化，弹窗意外关闭后重新打开自动恢复
  const [authForm, setAuthForm, clearAuthDraft] = usePersistedFormState<AuthFormState>(
    "draft:auth_register",
    (() => {
      let prefilledCode = "";
      if (typeof document !== "undefined") {
        const match = document.cookie.match(/(?:^|;\s*)ref_code=([^;]*)/);
        if (match) prefilledCode = decodeURIComponent(match[1]).toUpperCase();
      }
      return {
        displayName: "", identifier: "", email: "", phone: "",
        password: "", invitationCode: prefilledCode,
      };
    })(),
    { excludeKeys: ["password"] as (keyof AuthFormState)[], ttlMs: DRAFT_TTL_MS },
  );

  // ★ 切换模式时清空当前表单，切换到注册时从草稿恢复
  useEffect(() => {
    if (authMode === "login") {
      setAuthForm({ displayName: "", identifier: "", email: "", phone: "", password: "", invitationCode: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode]);

  const submitAuth = async (
    registerVerifyCode: string,
    registerCodeSent: boolean,
    prefLevel1: string | null,
    prefLevel2: string | null,
    prefLevel3: string | null,
  ): Promise<void> => {
    setAuthError("");

    const phone = authForm.phone.trim();
    // ★ 登录模式从 loginForm 读取密码，注册模式从 authForm 读取
    const password = authMode === "login" ? loginForm.password : authForm.password;

    if (!password) {
      setAuthError(t("formError"));
      return;
    }

    if (authMode === "register") {
      // 姓名必填
      if (!authForm.displayName.trim()) {
        setAuthError(t("authErrDisplayNameRequired"));
        return;
      }
      // 手机号必填
      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        setAuthError(t("authErrPhoneInvalid"));
        return;
      }
      const pwCheck = validatePassword(password);
      if (!pwCheck.valid) {
        setAuthError(pwCheck.message);
        return;
      }
      if (!registerCodeSent) {
        setAuthError(t("authErrSmsCodeFirst"));
        return;
      }
      if (registerVerifyCode.length !== 6) {
        setAuthError(t("authErrCodeLength"));
        return;
      }
      // 邀请码为可选字段：推荐链接自动填入或手动输入，留空亦可提交
      // 协议勾选校验：必须用户主动勾选，不得默认勾选
      if (!agreedToTerms) {
        setAuthError(t("authErrAgreementRequired"));
        return;
      }
    }

    // 行业偏好注册时不在表单中收集（注册后可在账户面板选填），不做必选校验

    try {
      if (authMode === "login") {
        // 登录支持手机号或邮箱
        const loginIdentifier = loginForm.identifier.trim();
        if (!loginIdentifier) {
          setAuthError(t("authErrPhoneInvalid"));
          return;
        }
        await login(loginIdentifier, loginForm.password);
        setLoginForm({ identifier: "", password: "" });
      } else {
        // 注册：手机号必填，邮箱选填
        await register({
          password,
          displayName: authForm.displayName,
          verifyCode: registerVerifyCode,
          invitationCode: authForm.invitationCode.trim(),
          phone,
          // ── 合规审计：记录用户同意协议的版本与时间 ──
          agreementVersion: "V2.0",
          agreementAcceptedAt: new Date().toISOString(),
        });
        // 行业偏好为注册后的可选项：仅在用户实际选择过（前两级齐全）时保存
        if (prefLevel1 && prefLevel2) {
          await saveIndustryPrefs({
            level1_id: Number(prefLevel1),
            level2_id: Number(prefLevel2),
            level3_id: prefLevel3 ? Number(prefLevel3) : null,
            level4_id: null,
            level5_id: null,
          });
        }
        onSuccess();
        // 注册成功，清除草稿
        clearAuthDraft();
      }
    } catch (err: any) {
      setAuthError(err.message || t("authLoginFailed"));
    }
  };

  return {
    t,
    authMode,
    setAuthMode,
    authError,
    setAuthError,
    authForm,
    setAuthForm,
    loginForm,
    setLoginForm,
    submitAuth,
    agreedToTerms,
    setAgreedToTerms,
  };
}
