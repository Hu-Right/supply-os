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
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/core/auth";
import type { SupplierClaimForm } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { saveIndustryPrefs } from "@/core/api/industry-prefs";
import { Input, Select } from "@/shared/ui";
import { useUnspscPrefCascade } from "../hooks/useUnspscPrefCascade";
import { UnspscPrefSelects } from "./UnspscPrefSelects";
import { fetchSmartInferUnspsc, type SmartInferResult } from "@/core/unspsc";
import { validatePassword, PASSWORD_MIN_LENGTH } from "@/shared/auth/passwordPolicy";

export interface LoginRegisterFormProps {
  onSuccess: () => void;
}

export function LoginRegisterForm({ onSuccess }: LoginRegisterFormProps) {
  const { t } = useLocale();
  const { login, register, claimMessage, sendResetCode, resetPassword } = useAuth();

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

  // ── 找回密码状态 ──
  const [forgotView, setForgotView] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");

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
    autoFillFromInference,
    searchAndAutoFillL3,
  } = useUnspscPrefCascade();

  // 主营业务智能推断状态（从 localStorage 恢复上次输入的关键词）
  const [mainBusiness, setMainBusinessRaw] = useState(
    () => localStorage.getItem("supply-os:main-business") || "",
  );
  const setMainBusiness = (v: string) => {
    setMainBusinessRaw(v);
    localStorage.setItem("supply-os:main-business", v);
  };
  const [inferResult, setInferResult] = useState<SmartInferResult | null>(null);
  const [inferLoading, setInferLoading] = useState(false);
  const [inferSearched, setInferSearched] = useState(false);
  // 关键词 ref：供 L2 变更时自动搜索 L3 使用
  const keywordRef = useRef("");

  // 防抖推断（300ms）：用户输入主营业务关键词后自动匹配 UNSPSC 类目路径
  useEffect(() => {
    if (mainBusiness.trim().length < 1) {
      setInferResult(null);
      setInferSearched(false);
      return;
    }
    const timer = setTimeout(async () => {
      setInferLoading(true);
      setInferSearched(false);
      try {
        const data = await fetchSmartInferUnspsc(mainBusiness.trim());
        if (data?.result) {
          setInferResult(data.result);
          autoFillFromInference(data.result);
        } else {
          setInferResult(null);
        }
        setInferSearched(true);
      } catch {
        // 推断失败不影响注册流程
      } finally {
        setInferLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mainBusiness, autoFillFromInference]);

  // 关键词或 L2 变更时，自动在三级子类中搜索匹配项
  useEffect(() => {
    keywordRef.current = mainBusiness.trim();
    if (keywordRef.current && prefLevel2) {
      searchAndAutoFillL3(keywordRef.current);
    }
  }, [mainBusiness, prefLevel2, searchAndAutoFillL3]);

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

    // 注册时前端预校验密码强度（登录不校验，只验证密码是否匹配）
    if (authMode === "register") {
      const pwCheck = validatePassword(password);
      if (!pwCheck.valid) {
        setAuthError(pwCheck.message);
        return;
      }
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
          level4_id: inferResult?.level4_id ?? null,
          level5_id: inferResult?.level5_id ?? null,
        }).catch((err) => console.error("Failed to save industry prefs", err));
        onSuccess();
      }
    } catch (err: any) {
      setAuthError(err.message || t("authLoginFailed"));
    }
  };

  /**
   * 找回密码 — 步骤 1：发送验证码
   * Forgot password — Step 1: Send verification code
   */
  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    setForgotSuccess("");

    const email = forgotEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setForgotError(t("authForgotEmailInvalid"));
      return;
    }

    setForgotLoading(true);
    try {
      await sendResetCode(email);
      setForgotStep(2);
      setForgotSuccess(t("authForgotCodeSent"));
    } catch (err: any) {
      setForgotError(err.message || t("authForgotSendFailed"));
    } finally {
      setForgotLoading(false);
    }
  };

  /**
   * 找回密码 — 步骤 2：重置密码
   * Forgot password — Step 2: Reset password
   */
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");

    if (forgotCode.trim().length !== 6) {
      setForgotError(t("authForgotCodeInvalid"));
      return;
    }
    const pwCheck = validatePassword(forgotNewPassword);
    if (!pwCheck.valid) {
      setForgotError(pwCheck.message);
      return;
    }

    setForgotLoading(true);
    try {
      await resetPassword(forgotEmail.trim(), forgotCode.trim(), forgotNewPassword);
      // 重置成功，自动登录后关闭弹窗
      onSuccess();
    } catch (err: any) {
      setForgotError(err.message || t("authForgotResetFailed"));
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <form onSubmit={forgotView ? (forgotStep === 1 ? handleSendResetCode : handleResetPassword) : submitAuth} className="space-y-4">
      {/* Login / Register toggle */}
      {!forgotView && (
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
      )}

      {/* ── 找回密码视图 ── */}
      {forgotView && (
        <div className="space-y-4">
          <h4 className="text-sm font-extrabold text-slate-900 text-center">
            {t("authForgotTitle")}
          </h4>

          {forgotStep === 1 ? (
            /* 步骤 1：输入邮箱 */
            <div className="space-y-3">
              <Input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder={t("authEmailPlaceholder")}
              />
              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-black hover:bg-slate-800 disabled:opacity-50"
              >
                {forgotLoading ? t("authForgotSending") : t("authForgotSendCode")}
              </button>
            </div>
          ) : (
            /* 步骤 2：输入验证码 + 新密码 */
            <div className="space-y-3">
              <p className="text-xs text-slate-500 text-center">
                {t("authForgotCodeHint")} {forgotEmail}
              </p>
              <Input
                type="text"
                value={forgotCode}
                onChange={(e) => setForgotCode(e.target.value)}
                placeholder={t("authForgotCodePlaceholder")}
                maxLength={6}
                className="text-center text-lg tracking-widest"
              />
              <Input
                type="password"
                value={forgotNewPassword}
                onChange={(e) => setForgotNewPassword(e.target.value)}
                placeholder={t("authForgotNewPasswordPlaceholder")}
                minLength={PASSWORD_MIN_LENGTH}
              />
              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-black hover:bg-slate-800 disabled:opacity-50"
              >
                {forgotLoading ? t("authForgotResetting") : t("authForgotResetSubmit")}
              </button>
            </div>
          )}

          {/* 错误 / 成功提示 */}
          {forgotError && (
            <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
              {forgotError}
            </p>
          )}
          {forgotSuccess && (
            <p className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg p-3">
              {forgotSuccess}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setForgotView(false);
              setForgotStep(1);
              setForgotEmail("");
              setForgotCode("");
              setForgotNewPassword("");
              setForgotError("");
              setForgotSuccess("");
            }}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-700"
          >
            ← {t("authForgotBackToLogin")}
          </button>
        </div>
      )}

      {/* ── 登录 / 注册表单（非找回密码时显示） ── */}
      {!forgotView && (
        <>
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
              {/* 主营业务智能推断 */}
              <div>
                <p className="text-xs font-black text-slate-500">
                  {t("authMainBusinessLabel")}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {t("authMainBusinessInferHint")}
                </p>
                <Input
                  type="text"
                  value={mainBusiness}
                  onChange={(e) => setMainBusiness(e.target.value)}
                  placeholder={t("authMainBusinessPlaceholder")}
                  className="mt-2 bg-white"
                />
                {inferLoading && (
                  <p className="mt-1 text-[11px] text-slate-400">匹配中...</p>
                )}
                {inferResult && !inferLoading && (
                  <p className="mt-1 text-[11px] text-teal-600">
                    {t("authMainBusinessInferred")}: {inferResult.matched_title}
                  </p>
                )}
                {!inferResult && inferSearched && !inferLoading && (
                  <p className="mt-1 text-[11px] text-amber-600">
                    {t("authMainBusinessNoMatch")}
                  </p>
                )}
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
              minLength={PASSWORD_MIN_LENGTH}
            />
          </div>

          {/* 忘记密码链接（仅登录模式显示） */}
          {authMode === "login" && (
            <button
              type="button"
              onClick={() => {
                setForgotView(true);
                setForgotEmail(authForm.email.trim());
                setAuthError("");
              }}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              {t("authForgotLink")}
            </button>
          )}

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
        </>
      )}
    </form>
  );
}
