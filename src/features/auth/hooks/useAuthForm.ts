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
  phone: string;
  password: string;
  invitationCode: string;
  userType: "personal" | "enterprise";
  registerMethod: "phone" | "email"; // 注册方式：手机号（默认）或邮箱
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
    phone: "",
    password: "",
    invitationCode: "",
    userType: "enterprise",
    registerMethod: "phone",
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
    const phone = authForm.phone.trim();
    const password = authForm.password;
    const isPhoneRegister = authForm.registerMethod === "phone" && /^1[3-9]\d{9}$/.test(phone);

    if (!password) {
      setAuthError(t("formError"));
      return;
    }

    if (authMode === "register") {
      if (isPhoneRegister && !phone) {
        setAuthError("请输入手机号");
        return;
      }
      if (!isPhoneRegister && !email) {
        setAuthError("请输入邮箱");
        return;
      }
      const pwCheck = validatePassword(password);
      if (!pwCheck.valid) {
        setAuthError(pwCheck.message);
        return;
      }
      if (!registerCodeSent) {
        setAuthError(isPhoneRegister ? "请先获取短信验证码" : "请先获取邮箱验证码");
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

    // 企业注册才需要公司名称
    if (authMode === "register" && authForm.userType === "enterprise" && !claimForm.companyName.trim()) {
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

    // 企业注册才需要行业偏好
    if (authMode === "register" && authForm.userType === "enterprise" && (!prefLevel1 || !prefLevel2)) {
      setAuthError(t("authIndustryPrefRequired"));
      return;
    }

    try {
      if (authMode === "login") {
        await login(email || phone, password);
        setAuthForm({ displayName: "", email: "", phone: "", password: "", invitationCode: "", userType: "enterprise", registerMethod: "phone" });
      } else {
        await register(
          isPhoneRegister ? (email || null) : email,
          password,
          authForm.displayName,
          authForm.userType === "enterprise" && claimForm.companyName.trim() ? { ...claimForm, supplierType: claimForm.supplierType as SupplierClaimForm["supplierType"] } : undefined,
          registerVerifyCode,
          authForm.invitationCode.trim(),
          authForm.userType,
          isPhoneRegister ? phone : undefined
        );
        // 企业注册才保存行业偏好
        if (authForm.userType === "enterprise") {
          await saveIndustryPrefs({
            level1_id: Number(prefLevel1),
            level2_id: Number(prefLevel2),
            level3_id: prefLevel3 ? Number(prefLevel3) : null,
            level4_id: null,
            level5_id: null,
          });
        }
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
