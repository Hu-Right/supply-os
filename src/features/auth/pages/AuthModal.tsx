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
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";

type AuthModalProps = {
  onClose: () => void;
};

export function AuthModal({ onClose }: AuthModalProps) {
  const { t } = useLocale();
  const { authUser, isVip, login, logout, claimMessage } = useAuth();

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
    const f = e.currentTarget as HTMLFormElement;
    f.querySelectorAll("input, textarea, select").forEach((el: any) =>
      el.setCustomValidity(
        !el.value || !String(el.value).trim() ? t("formRequired") : ""
      )
    );
    if (!f.reportValidity()) return;
    setAuthError("");

    if (!authForm.email || !authForm.password) {
      setAuthError(t("formError"));
      return;
    }

    if (authMode === "register" && !claimForm.companyName.trim()) {
      setAuthError("注册供应商会员时请填写公司名称");
      return;
    }

    try {
      if (authMode === "login") {
        // 登录路径 — 使用 AuthContext.login()
        await login(authForm.email, authForm.password);
        setAuthForm({ displayName: "", email: authForm.email, password: "" });
      } else {
        // 注册路径 — 创建账号 + 提交供应商绑定
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: authForm.email,
            password: authForm.password,
            display_name:
              authForm.displayName || authForm.email.split("@")[0],
          }),
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "注册失败，请稍后重试");

        // 注册 API 已返回用户数据，直接持久化到 localStorage
        window.localStorage.setItem(
          "supply_os_auth_user",
          JSON.stringify(data.user)
        );

        // 提交供应商绑定申请
        const claimRes = await fetch("/api/supplier-claims", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_key: data.user.user_key,
            company_name: claimForm.companyName,
            supplier_type: claimForm.supplierType,
            contact_name: claimForm.contactName || authForm.displayName,
            contact_phone: claimForm.contactPhone,
            contact_email: data.user.email,
            business_license_no: claimForm.businessLicenseNo,
          }),
        });
        const claimData = await claimRes.json().catch(() => ({}));
        if (!claimRes.ok)
          throw new Error(
            claimData.error || "账号已注册，但供应商申请提交失败"
          );

        // 注册 + 绑定全部成功，刷新页面让 AuthContext 恢复用户状态
        window.location.reload();
      }
    } catch (err: any) {
      setAuthError(err.message || "登录失败，请稍后重试");
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
              SUPPLY OS ACCOUNT
            </div>
            <h3 className="text-lg font-extrabold">会员登录与供应商注册</h3>
            <p className="text-xs text-slate-400 mt-1">
              注册时同步提交公司申请，审核通过后再关联正式供应商身份。
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
                      当前账号
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
                    {isVip ? "VIP MEMBER" : "FREE MEMBER"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="font-black text-slate-400">供应商身份</p>
                    <p className="font-bold text-slate-800 mt-1">
                      {authUser.supplier_id
                        ? `已审核关联 #${authUser.supplier_id}`
                        : "待提交或待审核"}
                    </p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="font-black text-slate-400">线索权益</p>
                    <p className="font-bold text-slate-800 mt-1">
                      {isVip ? "会员额度可用" : "免费体验额度"}
                    </p>
                  </div>
                </div>
              </div>
              {claimMessage && (
                <p className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg p-3">
                  {claimMessage}
                </p>
              )}
              <button
                onClick={logout}
                className="w-full py-2.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                退出登录
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
                  登录
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
                  注册供应商
                </button>
              </div>

              {/* Register: claim form */}
              {authMode === "register" && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-extrabold text-slate-900">
                      公司申请信息
                    </h4>
                    <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-1">
                      待审核
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
                      <option value="domestic">国内供应商</option>
                      <option value="international">国外供应商</option>
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
                  ? "登录会员"
                  : "注册并提交供应商申请"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
