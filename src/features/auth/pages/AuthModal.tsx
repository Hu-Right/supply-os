/**
 * 认证弹窗页面
 * Authentication Modal Page
 *
 * @module features/auth/pages/AuthModal
 * @description 从 App.tsx 迁移的认证弹窗，包含登录/注册/供应商绑定功能
 *              Auth modal extracted from App.tsx, including login/register/supplier claim
 */

import { useEffect, useState } from "react";
import { Crown, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/core/auth";
import type { SupplierClaimForm } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { useScrollLock } from "@/shared/ui";
import { MyRecordsPanel } from "@/features/payment";
import {
  fetchUnspscIndustries,
  fetchUnspscChildren,
  fetchIndustryPrefs,
  saveIndustryPrefs,
} from "@/features/procurement/api";
import type { UnspscOption } from "@/features/procurement/types";
import { getUnspscOptionLabel } from "@/features/procurement/unspsc-label";

type AuthModalProps = {
  onClose: () => void;
};

export function AuthModal({ onClose }: AuthModalProps) {
  const { t, locale } = useLocale();
  const { authUser, isVip, login, register, logout, claimMessage } = useAuth();
  const navigate = useNavigate();
  // 弹窗打开期间锁定背景滚动
  useScrollLock();

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

  // ── 账号默认行业偏好（本地差异 #5 配套 UI）──
  // 注册模式选取 + 已登录面板管理共用同一组三级级联状态（前两级必选，第三级可选）
  const [industryOptions, setIndustryOptions] = useState<UnspscOption[]>([]);
  const [subOptions, setSubOptions] = useState<UnspscOption[]>([]);
  const [subOptions2, setSubOptions2] = useState<UnspscOption[]>([]);
  const [prefLevel1, setPrefLevel1] = useState("");
  const [prefLevel2, setPrefLevel2] = useState("");
  const [prefLevel3, setPrefLevel3] = useState("");
  const [prefMessage, setPrefMessage] = useState("");
  const [prefMessageIsError, setPrefMessageIsError] = useState(false);

  // 一级行业选项：接口有缓存，弹窗打开即加载；locale 入依赖，切语言重拉界面语言译文
  useEffect(() => {
    fetchUnspscIndustries(locale)
      .then(setIndustryOptions)
      .catch(() => setIndustryOptions([]));
  }, [locale]);

  // 已登录时回填已保存的偏好（fetchIndustryPrefs 异常时内部返回 null，不会抛出）
  useEffect(() => {
    if (!authUser?.user_key) return;
    fetchIndustryPrefs(authUser.user_key).then((prefs) => {
      setPrefLevel1(prefs?.level1_id ? String(prefs.level1_id) : "");
      setPrefLevel2(prefs?.level2_id ? String(prefs.level2_id) : "");
      setPrefLevel3(prefs?.level3_id ? String(prefs.level3_id) : "");
    });
  }, [authUser?.user_key]);

  // 选定一级后加载二级细分类目
  useEffect(() => {
    if (!prefLevel1) {
      setSubOptions([]);
      return;
    }
    fetchUnspscChildren(prefLevel1, locale)
      .then(setSubOptions)
      .catch(() => setSubOptions([]));
  }, [prefLevel1, locale]);

  // 选定二级后加载三级类目（可选级，与 UnspscSelector 的逐级下钻一致）
  useEffect(() => {
    if (!prefLevel2) {
      setSubOptions2([]);
      return;
    }
    fetchUnspscChildren(prefLevel2, locale)
      .then(setSubOptions2)
      .catch(() => setSubOptions2([]));
  }, [prefLevel2, locale]);

  const handlePrefLevel1Change = (value: string) => {
    setPrefLevel1(value);
    setPrefLevel2("");
    setPrefLevel3("");
    setPrefMessage("");
  };

  const handlePrefLevel2Change = (value: string) => {
    setPrefLevel2(value);
    setPrefLevel3("");
    setPrefMessage("");
  };

  /** 已登录面板：保存当前选择为账号默认行业（前两级必选） */
  const savePrefs = async () => {
    if (!authUser?.user_key || !prefLevel1 || !prefLevel2) return;
    try {
      const res = await saveIndustryPrefs(authUser.user_key, {
        level1_id: Number(prefLevel1),
        level2_id: Number(prefLevel2),
        level3_id: prefLevel3 ? Number(prefLevel3) : null,
      });
      // 必须校验 res.ok：旧 dev 服务/路由缺失时 POST 返回非 2xx，不能提示假成功
      if (!res.ok) throw new Error(`SAVE_PREFS_${res.status}`);
      setPrefMessageIsError(false);
      setPrefMessage(t("authIndustryPrefSaved"));
      // 广播偏好已变更：公采页监听后按新偏好重新探测筛选（失败路径不广播）
      window.dispatchEvent(new CustomEvent("supply-os:industry-prefs-updated"));
    } catch (err) {
      console.error("Failed to save industry prefs", err);
      setPrefMessageIsError(true);
      setPrefMessage(t("authIndustryPrefFailed"));
    }
  };

  /** 已登录面板：清除账号默认行业（level1 传空即删除） */
  const clearPrefs = async () => {
    if (!authUser?.user_key) return;
    try {
      const res = await saveIndustryPrefs(authUser.user_key, { level1_id: null });
      if (!res.ok) throw new Error(`CLEAR_PREFS_${res.status}`);
      // 仅在后端确认清除后才复位本地选择，失败时保留原偏好显示
      setPrefLevel1("");
      setPrefLevel2("");
      setPrefLevel3("");
      setPrefMessageIsError(false);
      setPrefMessage(t("authIndustryPrefCleared"));
      // 广播偏好已清除：公采页监听后退出偏好筛选回全量
      window.dispatchEvent(new CustomEvent("supply-os:industry-prefs-updated"));
    } catch (err) {
      console.error("Failed to clear industry prefs", err);
      setPrefMessageIsError(true);
      setPrefMessage(t("authIndustryPrefFailed"));
    }
  };

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
        onClose();
      }
    } catch (err: any) {
      setAuthError(err.message || t("authLoginFailed"));
    }
  };

  // 三级级联下拉：注册模式与已登录面板共用（前两级必选，第三级可选）
  const industrySelects = (
    <>
      <select
        aria-label={t("authIndustryPrefSelect")}
        value={prefLevel1}
        onChange={(e) => handlePrefLevel1Change(e.target.value)}
        className="px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        <option value="">{t("authIndustryPrefSelect")}</option>
        {industryOptions.map((item) => (
          <option key={item.id} value={item.id}>
            {getUnspscOptionLabel(item, locale)}
          </option>
        ))}
      </select>
      <select
        aria-label={t("authIndustryPrefSub")}
        value={prefLevel2}
        onChange={(e) => handlePrefLevel2Change(e.target.value)}
        disabled={!prefLevel1}
        className="px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        <option value="">{t("authIndustryPrefSub")}</option>
        {subOptions.map((item) => (
          <option key={item.id} value={item.id}>
            {getUnspscOptionLabel(item, locale)}
          </option>
        ))}
      </select>
      <select
        aria-label={t("authIndustryPrefSub3")}
        value={prefLevel3}
        onChange={(e) => {
          setPrefLevel3(e.target.value);
          setPrefMessage("");
        }}
        disabled={!prefLevel2}
        className="px-3 py-2.5 text-sm bg-white rounded-lg border border-slate-200 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        <option value="">{t("authIndustryPrefSub3")}</option>
        {subOptions2.map((item) => (
          <option key={item.id} value={item.id}>
            {getUnspscOptionLabel(item, locale)}
          </option>
        ))}
      </select>
    </>
  );

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
              {/* 我的默认行业 — 公采页进入时按此偏好默认筛选（本地差异 #5 配套 UI） */}
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                <h4 className="text-sm font-extrabold text-slate-900">
                  {t("authIndustryPrefLabel")}
                </h4>
                {/* 进入即说明必选规则，避免用户点保存时才发现按钮不可用 */}
                <p className="mt-1 text-xs text-slate-400">
                  {t("authIndustryPrefRequiredHint")}
                </p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {industrySelects}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={savePrefs}
                    disabled={!prefLevel1 || !prefLevel2}
                    className="px-4 py-2 rounded-lg bg-teal-600 text-white text-xs font-black shadow-xs hover:bg-teal-700 disabled:opacity-50 disabled:hover:bg-teal-600"
                  >
                    {t("authIndustryPrefSave")}
                  </button>
                  <button
                    type="button"
                    onClick={clearPrefs}
                    className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                  >
                    {t("authIndustryPrefClear")}
                  </button>
                  {/* 未选满前两级时按钮旁给出引导，选满后自动消失 */}
                  {(!prefLevel1 || !prefLevel2) && (
                    <p className="text-xs font-bold text-amber-600">
                      {t("authIndustryPrefSaveHint")}
                    </p>
                  )}
                </div>
                {prefMessage && (
                  <p
                    className={`mt-3 text-xs font-bold rounded-lg p-3 border ${
                      prefMessageIsError
                        ? "text-rose-600 bg-rose-50 border-rose-100"
                        : "text-teal-700 bg-teal-50 border-teal-100"
                    }`}
                  >
                    {prefMessage}
                  </p>
                )}
              </div>
              <MyRecordsPanel onOpenNotice={openNotice} />
              {claimMessage && (
                <p className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg p-3">
                  {claimMessage}
                </p>
              )}
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
                      {industrySelects}
                    </div>
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
