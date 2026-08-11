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

import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from "react";
import type { AuthUser } from "@/types/auth";
import type { AuthContextValue, SupplierClaimForm } from "./types";
import { setAuthTokens, clearAuthTokens, getAuthToken } from "@/core/http";

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_USER_KEY = "supply_os_auth_user";

/**
 * 认证 Provider
 * Authentication Provider
 *
 * @param children - 子组件
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isVip, setIsVip] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");

  // 使用 ref 避免闭包陈旧引用
  const authUserRef = useRef<AuthUser | null>(authUser);

  /**
   * 持久化用户信息（同步更新 ref 和 state）
   * Persist user info (sync update ref and state)
   */
  const persistAuthUser = (user: AuthUser) => {
    authUserRef.current = user;
    setAuthUser(user);
    setIsVip(user.membership_tier === "vip");
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  };

  /**
   * 刷新认证状态
   * Refresh authentication state
   */
  const refreshAuth = async () => {
    const userKey = authUserRef.current?.user_key;
    if (!userKey) return;

    setIsAuthLoading(true);
    try {
      // 优先使用 JWT Token，回退到 query param
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const url = token
        ? "/api/auth/user"
        : `/api/auth/user?user_key=${encodeURIComponent(userKey)}`;
      const res = await fetch(url, { cache: "no-store", headers });
      const data = await res.json();
      if (!res.ok || !data.user) throw new Error(data.error || "刷新账号状态失败");
      persistAuthUser(data.user);
    } catch (err) {
      console.error("Error refreshing auth user:", err);
    } finally {
      setIsAuthLoading(false);
    }
  };

  /**
   * 登录
   * Login
   */
  const login = async (email: string, password: string) => {
    setIsAuthLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登录失败，请稍后重试");
      // 存储 JWT Token 对
      if (data.token && data.refresh_token) {
        setAuthTokens(data.token, data.refresh_token);
      }
      persistAuthUser(data.user);
    } finally {
      setIsAuthLoading(false);
    }
  };

  /**
   * 注册（含供应商绑定申请）
   * Register (with supplier claim application)
   */
  const register = async (email: string, password: string, displayName: string, claim?: SupplierClaimForm, verifyCode?: string) => {
    setIsAuthLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name: displayName || email.split("@")[0], verify_code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "注册失败，请稍后重试");

      // 存储 JWT Token 对（注册即登录）
      if (data.token && data.refresh_token) {
        setAuthTokens(data.token, data.refresh_token);
      }
      // 响应式更新，无需 reload
      persistAuthUser(data.user);

      // 提交供应商绑定申请
      if (claim) {
        const claimRes = await fetch("/api/supplier-claims", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_key: data.user.user_key,
            company_name: claim.companyName,
            supplier_type: claim.supplierType,
            contact_name: claim.contactName || displayName,
            contact_phone: claim.contactPhone,
            contact_email: data.user.email,
            business_license_no: claim.businessLicenseNo,
          }),
        });
        const claimData = await claimRes.json().catch(() => ({}));
        if (!claimRes.ok) throw new Error(claimData.error || "账号已注册，但供应商申请提交失败");
        // 对齐原版注册路径文案（手动绑定路径仍展示实时状态）
        setClaimMessage("注册成功，供应商绑定申请已提交，等待后台审核。");
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  /**
   * 登出
   * Logout
   */
  const logout = () => {
    authUserRef.current = null;
    setAuthUser(null);
    setIsVip(false);
    setClaimMessage("");
    window.localStorage.removeItem(AUTH_USER_KEY);
    clearAuthTokens();
  };

  /**
   * 提交供应商绑定申请
   * Submit supplier claim application
   */
  const submitSupplierClaim = async (claim: SupplierClaimForm) => {
    if (!authUserRef.current) {
      setClaimMessage("请先登录后再绑定公司");
      return;
    }

    setClaimMessage("");
    setIsAuthLoading(true);
    try {
      const res = await fetch("/api/supplier-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_key: authUserRef.current.user_key,
          company_name: claim.companyName,
          supplier_type: claim.supplierType,
          contact_name: claim.contactName,
          contact_phone: claim.contactPhone,
          contact_email: authUserRef.current.email,
          business_license_no: claim.businessLicenseNo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "绑定申请提交失败");
      setClaimMessage(`绑定申请已提交，状态：${data.status}`);
    } catch (err: any) {
      setClaimMessage(err.message || "绑定申请提交失败");
    } finally {
      setIsAuthLoading(false);
    }
  };

  /**
   * 发送找回密码验证码
   * Send password reset verification code
   */
  const sendResetCode = async (email: string) => {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "发送验证码失败");
    return { email_sent: data.email_sent ?? true, support_hint: data.support_hint ?? null };
  };

  /**
   * 重置密码（验证码+新密码），成功后自动登录
   * Reset password (code + new password), auto-login on success
   */
  const resetPassword = async (email: string, code: string, newPassword: string) => {
    setIsAuthLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "重置密码失败");
      // 存储 JWT Token 对（重置后自动登录）
      if (data.token && data.refresh_token) {
        setAuthTokens(data.token, data.refresh_token);
      }
      persistAuthUser(data.user);
    } finally {
      setIsAuthLoading(false);
    }
  };

  // 初始化：从 localStorage 恢复用户
  useEffect(() => {
    const savedUser = window.localStorage.getItem(AUTH_USER_KEY);
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser) as AuthUser;
        persistAuthUser(parsedUser);
        // 异步刷新用户信息
        refreshAuth();
      } catch {
        window.localStorage.removeItem(AUTH_USER_KEY);
      }
    }
  }, []);

  const value: AuthContextValue = {
    authUser,
    isVip,
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
  };

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
