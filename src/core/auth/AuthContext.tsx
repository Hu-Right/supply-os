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

    try {
      const res = await fetch(`/api/auth/user?user_key=${encodeURIComponent(userKey)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.user) throw new Error(data.error || "刷新账号状态失败");
      persistAuthUser(data.user);
    } catch (err) {
      console.error("Error refreshing auth user:", err);
    }
  };

  /**
   * 登录
   * Login
   */
  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "登录失败，请稍后重试");
    persistAuthUser(data.user);
  };

  /**
   * 注册（含供应商绑定申请）
   * Register (with supplier claim application)
   */
  const register = async (form: SupplierClaimForm) => {
    // 注意：此方法需要 email/password/displayName 参数，但接口设计为只接收 SupplierClaimForm
    // 实际使用时，App 层应先调用 register 创建账号，再调用 submitSupplierClaim
    // 这里简化为：注册时自动提交供应商绑定申请
    throw new Error("register() 需要 email/password，请使用 submitAuth() 在 App 层处理");
  };

  /**
   * 登出
   * Logout
   */
  const logout = () => {
    authUserRef.current = null;
    setAuthUser(null);
    setIsVip(false);
    window.localStorage.removeItem(AUTH_USER_KEY);
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
    login,
    register,
    logout,
    refreshAuth,
    submitSupplierClaim,
    claimMessage,
    setClaimMessage,
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
