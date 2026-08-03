/**
 * 登录/注册表单
 * Login / Register Form
 *
 * @module features/auth/components/LoginRegisterForm
 * @description 账号弹窗的登录/注册表单区块：登录/注册切换、注册时的供应商
 *              绑定信息（claim 表单）与主营行业选取（前两级必选），注册成功
 *              后静默保存行业偏好并经 onSuccess 关闭弹窗。
 *              Login/register form of the auth modal: mode toggle, supplier
 *              claim info with industry cascade on register, silent pref save
 *              and onSuccess close.
 */
import { useState } from "react";
import { useAuth } from "@/core/auth";
import type { SupplierClaimForm } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { saveIndustryPrefs } from "@/core/api/industry-prefs";
import { Input, Select } from "@/shared/ui";
import { useUnspscPrefCascade } from "../hooks/useUnspscPrefCascade";
import { UnspscPrefSelects } from "./UnspscPrefSelects";

export interface LoginRegisterFormProps {
  onSuccess: () => void;
}

export function LoginRegisterForm({ onSuccess }: LoginRegisterFormProps) {
  const { t } = useLocale();
  const { login, register, claimMessage } = useAuth();

  // Local UI state
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState({
    displayName: "",
    email: "",
    password: "",
  });
  const [claimForm, setClaimForm] = useState({
    companyName: "",
    supplierType: "domestic",
    contactName: "",
    contactPhone: "",
    businessLicenseNo: "",
  });

  // 主营行业偏好：注册时前两级必选（三级联动，第三级可选）
  const {
    industryOptions,
    subOptions,
    subOptions2,
    prefLevel1,
    prefLevel2,
    prefLevel3,
    setPrefLevel3,
    handlePrefLevel1Change,
    handlePrefLevel2Change,
  } = useUnspscPrefCascade();

  /**
   * 提交认证（登录或注册）
   * Submit authentication (login or register)
   */
  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    // 必填校验以 React 受控状态为准：浏览器自动填充邮箱/密码时，出于隐私策略
    // 直接读取 DOM 的 el.value 可能返回空串，导致「已填却提示请填写该字段」。
    // 受控状态由 onChange 写入，不受该屏蔽影响，是可靠的真值来源。
    const email = authForm.email.trim();
    const password = authForm.password;

    if (!email || !password) {
      setAuthError(t("formError"));
      return;
    }

    if (authMode === "register" && !claimForm.companyName.trim()) {
      setAuthError(t("authCompanyNameRequired"));
      return;
    }

    // 主营行业前两级必选（三级联动的第三级为可选）
    if (authMode === "register" && (!prefLevel1 || !prefLevel2)) {
      setAuthError(t("authIndustryPrefRequired"));
      return;
    }

    try {
      if (authMode === "login") {
        // 登录路径 — 使用 AuthContext.login()
        await login(email, password);
        setAuthForm({ displayName: "", email, password: "" });
      } else {
        // 注册路径 — 使用 AuthContext.register()（内部已含持久化 + 供应商绑定）
        await register(
          email,
          password,
          authForm.displayName,
          claimForm.companyName.trim() ? { ...claimForm, supplierType: claimForm.supplierType as SupplierClaimForm["supplierType"] } : undefined
        );
        // 注册成功后静默保存偏好（user_key 即小写邮箱），保存失败不阻断注册流程
        saveIndustryPrefs(email.toLowerCase(), {
          level1_id: Number(prefLevel1),
          level2_id: Number(prefLevel2),
          level3_id: prefLevel3 ? Number(prefLevel3) : null,
        }).catch((err) => console.error("Failed to save industry prefs", err));
        onSuccess();
      }
    } catch (err: any) {
      setAuthError(err.message || t("authLoginFailed"));
    }
  };

  return (
    <form onSubmit={submitAuth} className="space-y-4">
      {/* Login / Register toggle */}
      <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setAuthMode("login")}
          className={`py-2.5 rounded-lg text-sm font-black ${
            authMode === "login"
              ? "bg-white shadow-xs text-slate-900"
              : "text-slate-500"
          }`}
        >
          {t("authLoginTab")}
        </button>
        <button
          type="button"
          onClick={() => setAuthMode("register")}
          className={`py-2.5 rounded-lg text-sm font-black ${
            authMode === "register"
              ? "bg-white shadow-xs text-slate-900"
              : "text-slate-500"
          }`}
        >
          {t("authRegisterTab")}
        </button>
      </div>

      {/* Register: claim form */}
      {authMode === "register" && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-slate-900">
              {t("authCompanyClaimInfo")}
            </h4>
            <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-1">
              {t("authPendingReview")}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="text"
              value={authForm.displayName}
              onChange={(e) =>
                setAuthForm({ ...authForm, displayName: e.target.value })
              }
              placeholder={t("authContactNamePlaceholder")}
              className="bg-white"
            />
            <Select
              value={claimForm.supplierType}
              onChange={(e) =>
                setClaimForm({
                  ...claimForm,
                  supplierType: e.target.value,
                })
              }
              className="bg-white"
            >
              <option value="domestic">{t("authSupplierDomestic")}</option>
              <option value="international">{t("authSupplierInternational")}</option>
            </Select>
            <Input
              type="text"
              value={claimForm.companyName}
              onChange={(e) =>
                setClaimForm({
                  ...claimForm,
                  companyName: e.target.value,
                })
              }
              placeholder={t("authCompanyPlaceholder")}
              className="sm:col-span-2 bg-white"
            />
            <Input
              type="text"
              value={claimForm.contactPhone}
              onChange={(e) =>
                setClaimForm({
                  ...claimForm,
                  contactPhone: e.target.value,
                })
              }
              placeholder={t("authPhonePlaceholder")}
              className="bg-white"
            />
            <Input
              type="text"
              value={claimForm.businessLicenseNo}
              onChange={(e) =>
                setClaimForm({
                  ...claimForm,
                  businessLicenseNo: e.target.value,
                })
              }
              placeholder={t("authLicensePlaceholder")}
              className="bg-white"
            />
          </div>
          {/* 主营行业选取（前两级必选，注册成功后作为公采页默认筛选偏好） */}
          <div>
            <p className="text-xs font-black text-slate-500">
              {t("authIndustryPrefLabel")}
            </p>
            {/* 进入即说明必选规则，避免提交时才报错 */}
            <p className="mt-1 text-[11px] text-slate-400">
              {t("authIndustryPrefRequiredHint")}
            </p>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <UnspscPrefSelects
                industryOptions={industryOptions}
                subOptions={subOptions}
                subOptions2={subOptions2}
                prefLevel1={prefLevel1}
                prefLevel2={prefLevel2}
                prefLevel3={prefLevel3}
                onLevel1Change={handlePrefLevel1Change}
                onLevel2Change={handlePrefLevel2Change}
                onLevel3Change={setPrefLevel3}
              />
            </div>
          </div>
        </div>
      )}

      {/* Email + Password */}
      <div className="space-y-3">
        <Input
          type="email"
          value={authForm.email}
          onChange={(e) =>
            setAuthForm({ ...authForm, email: e.target.value })
          }
          placeholder={t("authEmailPlaceholder")}
        />
        <Input
          type="password"
          value={authForm.password}
          onChange={(e) =>
            setAuthForm({ ...authForm, password: e.target.value })
          }
          placeholder={t("authPasswordPlaceholder")}
          minLength={6}
        />
      </div>

      {/* Error / Success messages */}
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
      <button
        type="submit"
        className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-black hover:bg-slate-800"
      >
        {authMode === "login"
          ? t("authLoginSubmit")
          : t("authRegisterSubmit")}
      </button>
    </form>
  );
}
