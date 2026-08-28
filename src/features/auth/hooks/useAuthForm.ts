/**
 * 登录/注册表单 Hook
 * Login/Register Form Hook
 *
 * @module features/auth/hooks/useAuthForm
 */
import { useState } from "react";
import { useAuth } from "@/core/auth";
import type { SupplierClaimForm } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { saveIndustryPrefs } from "@/core/api/industry-prefs";
import { validatePassword } from "@/shared/auth/passwordPolicy";

export interface AuthFormState {
  displayName: string;
  email: string;
  password: string;
  invitationCode: string;
}

export interface ClaimFormState {
  companyName: string;
  supplierType: string;
  contactName: string;
  contactPhone: string;
  businessLicenseNo: string;
}

export function useAuthForm(onSuccess: () => void) {
  const { t } = useLocale();
  const { login, register, claimMessage } = useAuth();

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState<AuthFormState>({
    displayName: "",
    email: "",
    password: "",
    invitationCode: "",
  });
  const [claimForm, setClaimForm] = useState<ClaimFormState>({
    companyName: "",
    supplierType: "domestic",
    contactName: "",
    contactPhone: "",
    businessLicenseNo: "",
  });

  const submitAuth = async (
    registerVerifyCode: string,
    registerCodeSent: boolean,
    prefLevel1: string | null,
    prefLevel2: string | null,
    prefLevel3: string | null,
  ): Promise<void> => {
    setAuthError("");

    const email = authForm.email.trim();
    const password = authForm.password;

    if (!email || !password) {
      setAuthError(t("formError"));
      return;
    }

    if (authMode === "register") {
      const pwCheck = validatePassword(password);
      if (!pwCheck.valid) {
        setAuthError(pwCheck.message);
        return;
      }
      if (!registerCodeSent) {
        setAuthError("请先获取邮箱验证码");
        return;
      }
      if (registerVerifyCode.length !== 6) {
        setAuthError("请输入6位验证码");
        return;
      }
      // 邀请码必填
      if (!authForm.invitationCode.trim()) {
        setAuthError(t("authInvitationCodeRequired"));
        return;
      }
    }

    if (authMode === "register" && !claimForm.companyName.trim()) {
      setAuthError(t("authCompanyNameRequired"));
      return;
    }

    if (authMode === "register") {
      // 调试：打印提交瞬间实际收到的行业 ID，便于定位状态同步问题
      console.info("[submitAuth] industry prefs at submit:", {
        prefLevel1,
        prefLevel2,
        prefLevel3,
      });
    }

    if (authMode === "register" && (!prefLevel1 || !prefLevel2)) {
      setAuthError(t("authIndustryPrefRequired"));
      return;
    }

    try {
      if (authMode === "login") {
        await login(email, password);
        setAuthForm({ displayName: "", email, password: "" });
      } else {
        await register(
          email,
          password,
          authForm.displayName,
          claimForm.companyName.trim() ? { ...claimForm, supplierType: claimForm.supplierType as SupplierClaimForm["supplierType"] } : undefined,
          registerVerifyCode,
          authForm.invitationCode.trim()
        );
        await saveIndustryPrefs({
          level1_id: Number(prefLevel1),
          level2_id: Number(prefLevel2),
          level3_id: prefLevel3 ? Number(prefLevel3) : null,
          level4_id: null,
          level5_id: null,
        });
        onSuccess();
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
    claimForm,
    setClaimForm,
    claimMessage,
    submitAuth,
  };
}
