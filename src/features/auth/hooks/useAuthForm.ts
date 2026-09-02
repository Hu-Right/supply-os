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
  identifier: string; // 登录用：手机号
  email: string; // 注册用：选填邮箱（仅用于通知，不作为登录凭证）
  phone: string; // 注册用：必填手机号
  password: string;
  invitationCode: string;
  userType: "personal" | "enterprise";
}

export interface ClaimFormState {
  companyName: string;
  supplierType: string;
  contactName: string;
  contactPhone: string;
  businessLicenseNo: string;
}

export function useAuthForm(onSuccess: () => void, initialMode: "login" | "register" = "login") {
  const { t } = useLocale();
  const { login, register, claimMessage } = useAuth();

  // 初始模式由调用方注入（扫码推广场景 layout-shell 传 "register"）
  const [authMode, setAuthMode] = useState<"login" | "register">(initialMode);
  const [authError, setAuthError] = useState("");
  /** 用户是否主动勾选同意协议（默认 false，不得预先勾选） */
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [authForm, setAuthForm] = useState<AuthFormState>(() => {
    // ★ 推荐链接自动带入：从 Cookie 读取 ref_code 预填邀请码
    let prefilledCode = "";
    if (typeof document !== "undefined") {
      const match = document.cookie.match(/(?:^|;\s*)ref_code=([^;]*)/);
      if (match) prefilledCode = decodeURIComponent(match[1]).toUpperCase();
    }
    return {
      displayName: "",
      identifier: "",
      email: "",
      phone: "",
      password: "",
      invitationCode: prefilledCode,
      userType: "enterprise",
    };
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
    qualificationData?: Record<string, string | string[]> | null,
  ): Promise<void> => {
    setAuthError("");

    const email = authForm.email.trim();
    const phone = authForm.phone.trim();
    const password = authForm.password;

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

    // 企业注册才需要公司名称
    if (authMode === "register" && authForm.userType === "enterprise" && !claimForm.companyName.trim()) {
      setAuthError(t("authCompanyNameRequired"));
      return;
    }

    // 行业偏好注册时不在表单中收集（注册后可在账户面板选填），不做必选校验

    try {
      if (authMode === "login") {
        // 登录支持手机号或邮箱
        const loginIdentifier = authForm.identifier.trim();
        if (!loginIdentifier) {
          setAuthError(t("authErrPhoneInvalid"));
          return;
        }
        await login(loginIdentifier, password);
        setAuthForm({ displayName: "", identifier: "", email: "", phone: "", password: "", invitationCode: "", userType: "enterprise" });
      } else {
        // 注册：手机号必填，邮箱选填
        await register({
          email: email || null,
          password,
          displayName: authForm.displayName,
          claim: authForm.userType === "enterprise" && claimForm.companyName.trim() ? { ...claimForm, supplierType: claimForm.supplierType as SupplierClaimForm["supplierType"] } : undefined,
          verifyCode: registerVerifyCode,
          invitationCode: authForm.invitationCode.trim(),
          userType: authForm.userType,
          phone,
          // ── 合规审计：记录用户同意协议的版本与时间 ──
          agreementVersion: "V2.0",
          agreementAcceptedAt: new Date().toISOString(),
        });
        // 行业偏好为注册后的可选项：仅在用户实际选择过（前两级齐全）时保存
        if (authForm.userType === "enterprise" && prefLevel1 && prefLevel2) {
          await saveIndustryPrefs({
            level1_id: Number(prefLevel1),
            level2_id: Number(prefLevel2),
            level3_id: prefLevel3 ? Number(prefLevel3) : null,
            level4_id: null,
            level5_id: null,
          });
        }
        // 企业注册时提交完整 14 字段诊断数据到统一评估表
        if (authForm.userType === "enterprise" && qualificationData && Object.keys(qualificationData).length > 0) {
          try {
            const { api: apiFetch } = await import("@/core/http");
            await apiFetch("/api/supplier-qualification", {
              method: "POST",
              body: {
                ...qualificationData,        // 完整 14 字段透传
                source: "registration",
                user_key: phone,             // 关联用户
                invitation_code: authForm.invitationCode.trim(), // 解析员工 ID（KPI 归属）
              },
            });
          } catch {
            // 静默失败，不影响注册流程
          }
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
    agreedToTerms,
    setAgreedToTerms,
  };
}
