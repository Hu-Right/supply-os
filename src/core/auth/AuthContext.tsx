/**
 * 认证上下文
 * Authentication Context
 *
 * @module core/auth/AuthContext
 * @description 认证状态管理 + 业务方法（登录/注册/登出/刷新/供应商绑定）。
 *              弹窗 UI 状态不在这里，由 App 层管理。
 *              Authentication state management + business methods (login/register/logout/refresh/supplier claim).
 *              Modal UI state is NOT here, managed by App layer.
 */

import { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import type { AuthUser } from "@/types/auth";
import type { AuthContextValue, SupplierClaimForm, RegisterOptions } from "./types";
// 双轨制退役（轨道C）：认证链路全部走统一请求层 api()，
// 获得 401 自动刷新重试、性能指标采集与统一错误语义（原裸 fetch 双通道已移除）。
import { setAuthTokens, clearAuthTokens, clearApiCache, api, ApiError } from "@/core/http";
import { useLocale } from "@/core/i18n";
import { onAppEvent } from "@/core/events";
import { MEMBERSHIP_TIER } from "@/shared/constants/membership";

/** 认证接口响应（登录/注册/重置密码共用：JWT Access Token + 用户信息；
 * Refresh Token 同时经 HttpOnly Cookie + 响应体下发，客户端双存储） */
interface AuthResponse {
  token?: string;
  refresh_token?: string;
  user: AuthUser;
  [key: string]: unknown;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_USER_KEY = "supply_os_auth_user";

/**
 * 认证 Provider
 * Authentication Provider
 *
 * @param children - 子组件
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { locale, t } = useLocale();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isVip, setIsVip] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  /** 认证初始化完成标志：localStorage 恢复 + 可选 refresh 完成后才为 true */
  const [authReady, setAuthReady] = useState(false);

  // 使用 ref 避免闭包陈旧引用
  const authUserRef = useRef<AuthUser | null>(authUser);

  /**
   * 持久化用户信息（同步更新 ref 和 state）
   * Persist user info (sync update ref and state)
   */
  // P2-1 性能修复：方法 useCallback 化 + value useMemo，避免每次渲染
  // 重建 context value 导致所有消费组件级联重渲染
  const persistAuthUser = useCallback((user: AuthUser) => {
    authUserRef.current = user;
    setAuthUser(user);
    setIsVip(user.membership_tier === MEMBERSHIP_TIER.VIP);
    // P2 容错：localStorage 满或隐私模式下可能抛异常，不阻断登录主流程
    // 隐私约束：此处只允许持久化脱敏后字段（昵称 nickname、掩码 phone），禁止存真实姓名
    try {
      window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.warn("[auth] localStorage 写入失败（存储可能已满或隐私模式）:", (e as Error).message);
    }
  }, []);

  /**
   * 刷新认证状态
   * Refresh authentication state
   */
  const refreshAuth = useCallback(async () => {
    // 身份由 JWT 承载（api() 自动附加），不依赖缓存的 authUser.id。
    // 旧版守卫要求缓存 id 存在才刷新，当 localStorage 快照缺 id 时会永久早退，
    // 导致上下文无法自愈（徽章停免费会员 + 记录区误报未登录）。
    setIsAuthLoading(true);
    try {
      // api() 自动附加 JWT；未登录时返回 401 由下方 catch 静默降级（与原行为一致）
      const data = await api<{ user: AuthUser }>("/api/auth/user", { cache: "no-store" });
      if (!data.user) throw new Error(t("authRefreshFailed"));
      persistAuthUser(data.user);
    } catch (err) {
      // 401 是 Token 过期的预期行为（如用户长时间未操作后返回），降级为 warn 避免日志误导
      if (err instanceof ApiError && err.status === 401) {
        console.warn("[auth] Access Token 已过期且刷新未成功，用户需重新登录");
      } else {
        console.error("Error refreshing auth user:", err);
      }
    } finally {
      setIsAuthLoading(false);
    }
  }, [persistAuthUser, t]);

  /**
   * 登录（仅手机号）
   * Login (phone only)
   */
  const login = useCallback(async (phone: string, password: string) => {
    setIsAuthLoading(true);
    try {
      // api() 非 2xx 时抛出 ApiError（message = 服务端 error 字段），与原语义一致
      const data = await api<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: { identifier: phone, password },
      });
      // 存储 Access Token + Refresh Token（Refresh Token 同时经 HttpOnly Cookie + localStorage 降级存储）
      if (data.token) {
        setAuthTokens(data.token, data.refresh_token);
      }
      persistAuthUser(data.user);
    } finally {
      setIsAuthLoading(false);
    }
  }, [persistAuthUser]);

  /**
   * 注册（手机号必填，邮箱绑定在注册后个人中心完成）
   * Register (phone required; email binding is done post-registration in profile)
   */
  const register = useCallback(async ({ password, displayName, claim, verifyCode, invitationCode, userType, phone, agreementVersion, agreementAcceptedAt }: RegisterOptions) => {
    setIsAuthLoading(true);
    try {
      const data = await api<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: {
          password, display_name: displayName, verify_code: verifyCode,
          invitation_code: invitationCode, user_type: userType, phone,
          // 默认昵称按注册界面语言生成（服务端 generateNickname 白名单内回退）
          locale,
          // ── 合规审计：协议同意记录 ──
          agreement_version: agreementVersion,
          agreement_accepted_at: agreementAcceptedAt,
        },
      });

      // 存储 Access Token + Refresh Token（注册即登录）
      if (data.token) {
        setAuthTokens(data.token, data.refresh_token);
      }
      // 响应式更新，无需 reload
      persistAuthUser(data.user);

      // 提交供应商绑定申请（注册成功后携带新签发的 JWT，api() 自动附加）
      // 注：注册流程已移除邮箱收集，contact_email 留空，用户可在个人中心绑定邮箱后补充
      if (claim) {
        await api("/api/supplier-claims", {
          method: "POST",
          body: {
            company_name: claim.companyName,
            supplier_type: claim.supplierType,
            contact_name: claim.contactName || displayName,
            contact_phone: claim.contactPhone,
            business_license_no: claim.businessLicenseNo,
          },
        });
        // 对齐原版注册路径文案（手动绑定路径仍展示实时状态）
        setClaimMessage(t("authRegisterClaimSubmitted"));
      }
    } finally {
      setIsAuthLoading(false);
    }
  }, [persistAuthUser, locale, t]);

  /**
   * 登出
   * Logout
   */
  const logout = useCallback(async () => {
    // L-2 安全加固 + B2【P1】：调用后端登出 API 撤销 Refresh Token + 清除 HttpOnly Cookie
    // Refresh Token 现在由 HttpOnly Cookie 自动携带，无需手动读取
    try {
      await api("/api/auth/logout", {
        method: "POST",
        body: {}, // Cookie 由浏览器自动发送，服务端从 Cookie 读取 Refresh Token
      }).catch(() => {});
    } catch { /* 网络异常不阻断登出 */ }

    authUserRef.current = null;
    setAuthUser(null);
    setIsVip(false);
    setClaimMessage("");
    window.localStorage.removeItem(AUTH_USER_KEY);
    clearAuthTokens();
    // B1 配套（2026-08-20）：解锁列表/详情等身份相关接口已不再携带 user_key 缓存隔离，
    // 登出时统一清空 API 缓存，防止下一账号命中前账号的缓存数据
    clearApiCache();
  }, []);

  /**
   * 提交供应商绑定申请
   * Submit supplier claim application
   */
  const submitSupplierClaim = useCallback(async (claim: SupplierClaimForm) => {
    if (!authUserRef.current) {
      setClaimMessage(t("authLoginRequiredForBind"));
      return;
    }

    setClaimMessage("");
    setIsAuthLoading(true);
    try {
      const data = await api<{ status?: string }>("/api/supplier-claims", {
        method: "POST",
        body: {
          company_name: claim.companyName,
          supplier_type: claim.supplierType,
          contact_name: claim.contactName,
          contact_phone: claim.contactPhone,
          contact_email: authUserRef.current.email,
          business_license_no: claim.businessLicenseNo,
        },
      });
      setClaimMessage(`绑定申请已提交，状态：${data.status}`);
    } catch (err: unknown) {
      setClaimMessage((err as Error).message || t("authBindFailed"));
    } finally {
      setIsAuthLoading(false);
    }
  }, [t]);

  /**
   * 发送找回密码验证码
   * Send password reset verification code
   */
  const sendResetCode = useCallback(async (identifier: string) => {
    const data = await api<{ email_sent?: boolean; support_hint?: string | null }>(
      "/api/auth/forgot-password",
      { method: "POST", body: { identifier } },
    );
    return { email_sent: data.email_sent ?? true, support_hint: data.support_hint ?? null };
  }, []);

  /**
   * 重置密码（验证码+新密码），成功后自动登录
   * Reset password (code + new password), auto-login on success
   */
  const resetPassword = useCallback(async (identifier: string, code: string, newPassword: string) => {
    setIsAuthLoading(true);
    try {
      const data = await api<AuthResponse>("/api/auth/reset-password", {
        method: "POST",
        body: { identifier, code, new_password: newPassword },
      });
      // 存储 Access Token + Refresh Token（重置后自动登录）
      if (data.token) {
        setAuthTokens(data.token, data.refresh_token);
      }
      persistAuthUser(data.user);
    } finally {
      setIsAuthLoading(false);
    }
  }, [persistAuthUser]);

  // 初始化：从 localStorage 恢复用户
  useEffect(() => {
    const savedUser = window.localStorage.getItem(AUTH_USER_KEY);
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser) as AuthUser;
        persistAuthUser(parsedUser);
        // 异步刷新用户信息，完成后标记就绪
        refreshAuth().finally(() => setAuthReady(true));
      } catch {
        window.localStorage.removeItem(AUTH_USER_KEY);
        setAuthReady(true);
      }
    } else {
      // 无缓存用户，直接标记就绪（未登录状态）
      setAuthReady(true);
    }
  }, [persistAuthUser, refreshAuth]);

  // 会话过期守卫：当 api-client 检测到 Access Token + Refresh Token 均失效时，
  // 派发 supply-os:unauthorized 事件 → 此处清除 React 状态 → ProtectedRoute 自动重定向
  useEffect(() => {
    return onAppEvent("supply-os:unauthorized", () => {
      authUserRef.current = null;
      setAuthUser(null);
      setIsVip(false);
      window.localStorage.removeItem(AUTH_USER_KEY);
      clearApiCache();
    });
  }, []);

  // 会员等级变更：支付成功后服务端更新 membership_tier，此处刷新缓存
  useEffect(() => {
    return onAppEvent("supply-os:membership-changed", () => {
      refreshAuth().catch(() => {
        console.warn("[auth] 会员等级刷新失败，用户可能需要手动刷新页面");
      });
    });
  }, [refreshAuth]);

  // P2-1：value useMemo——仅状态/方法真实变化时才重建，阻断消费组件级联重渲染
  const value: AuthContextValue = useMemo(() => ({
    authUser,
    isVip,
    authReady,
    isAuthLoading,
    login,
    register,
    logout,
    refreshAuth,
    submitSupplierClaim,
    claimMessage,
    setClaimMessage,
    sendResetCode,
    resetPassword,
  }), [authUser, isVip, authReady, isAuthLoading, login, register, logout, refreshAuth, submitSupplierClaim, claimMessage, sendResetCode, resetPassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 使用认证上下文
 * Use authentication context
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used within <AuthProvider>");
  }
  return ctx;
}

/**
 * 可选认证上下文：无 Provider 时返回 null（供可独立渲染的展示组件使用）
 * Optional auth context: returns null when no provider is present
 */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
