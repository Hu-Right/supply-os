/**
 * 认证弹窗页面
 * Authentication Modal Page
 *
 * @module features/auth/pages/AuthModal
 * @description 从 App.tsx 迁移的认证弹窗，包含登录/注册/供应商绑定功能
 *              Auth modal extracted from App.tsx, including login/register/supplier claim
 */

import { useState } from "react";
import { Crown, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/core/auth";
import type { SupplierClaimForm } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { MyRecordsPanel } from "@/features/payment";

type AuthModalProps = {
  onClose: () => void;
};

export function AuthModal({ onClose }: AuthModalProps) {
  const { t } = useLocale();
  const { authUser, isVip, login, register, logout, claimMessage } = useAuth();
  const navigate = useNavigate();

  // 打开关联公告：先关闭账户弹窗再跳转到公采页
  const openNotice = (noticeId: number) => {
    onClose();
    navigate(`/procurement?notice_id=${noticeId}`);
  };

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
        onClose();
      }
    } catch (err: any) {
      setAuthError(err.message || t("authLoginFailed"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-start">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black text-teal-300 bg-teal-400/10 border border-teal-400/20 rounded-full px-2 py-1 mb-2">
              <Crown className="w-3.5 h-3.5" />
              {t("authModalBadge")}
            </div>
            <h3 className="text-lg font-extrabold">{t("authModalTitle")}</h3>
            <p className="text-xs text-slate-400 mt-1">
              {t("authModalDesc")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[calc(90vh-88px)]">
          {authUser ? (
            /* 已登录 — 显示账号信息 */
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-slate-500 uppercase">
                      {t("authCurrentAccount")}
                    </p>
                    <h4 className="text-lg font-extrabold text-slate-900 mt-1">
                      {authUser.display_name || authUser.email}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {authUser.email}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black ${
                      isVip
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : "bg-white text-slate-600 border border-slate-200"
                    }`}
                  >
                    {isVip ? t("authVipMember") : t("authFreeMember")}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="font-black text-slate-400">{t("authSupplierStatus")}</p>
                    <p className="font-bold text-slate-800 mt-1">
                      {authUser.supplier_id
                        ? t("authSupplierVerified", { id: authUser.supplier_id })
                        : t("authSupplierPending")}
                    </p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="font-black text-slate-400">{t("authLeadQuota")}</p>
                    <p className="font-bold text-slate-800 mt-1">
                      {isVip ? t("authVipQuota") : t("authFreeQuota")}
                    </p>
                  </div>
                </div>
              </div>
              {claimMessage && (
                <p className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg p-3">
                  {claimMessage}
                </p>
              )}
              <div className="rounded-xl border border-slate-200 p-4">
                <MyRecordsPanel onOpenNotice={openNotice} />
              </div>
              <button
                onClick={logout}
                className="w-full py-2.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                {t("authLogout")}
              </button>
            </div>
          ) : (
            /* 未登录 — 显示登录/注册表单 */
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
                    <input
                      type="text"
                      value={authForm.displayName}
                      onChange={(e) =>
                        setAuthForm({ ...authForm, displayName: e.target.value })
                      }
                      placeholder={t("authContactNamePlaceholder")}
                      className="px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <select
                      value={claimForm.supplierType}
                      onChange={(e) =>
                        setClaimForm({
                          ...claimForm,
                          supplierType: e.target.value,
                        })
                      }
                      className="px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="domestic">{t("authSupplierDomestic")}</option>
                      <option value="international">{t("authSupplierInternational")}</option>
                    </select>
                    <input
                      type="text"
                      value={claimForm.companyName}
                      onChange={(e) =>
                        setClaimForm({
                          ...claimForm,
                          companyName: e.target.value,
                        })
                      }
                      placeholder={t("authCompanyPlaceholder")}
                      className="sm:col-span-2 px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <input
                      type="text"
                      value={claimForm.contactPhone}
                      onChange={(e) =>
                        setClaimForm({
                          ...claimForm,
                          contactPhone: e.target.value,
                        })
                      }
                      placeholder={t("authPhonePlaceholder")}
                      className="px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <input
                      type="text"
                      value={claimForm.businessLicenseNo}
                      onChange={(e) =>
                        setClaimForm({
                          ...claimForm,
                          businessLicenseNo: e.target.value,
                        })
                      }
                      placeholder={t("authLicensePlaceholder")}
                      className="px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>
              )}

              {/* Email + Password */}
              <div className="space-y-3">
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, email: e.target.value })
                  }
                  placeholder={t("authEmailPlaceholder")}
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, password: e.target.value })
                  }
                  placeholder={t("authPasswordPlaceholder")}
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
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
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
