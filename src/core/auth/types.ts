/**
 * 认证相关类型
 * Authentication Types
 *
 * @module core/auth/types
 * @description 认证状态、用户画像、供应商绑定等数据结构
 *              Authentication state, user profile, supplier claim binding
 */

import type { AuthUser } from "@/types/auth";

export type { AuthUser };

/**
 * 供应商绑定申请表单
 * Supplier Claim Application Form
 */
export interface SupplierClaimForm {
  companyName: string;
  supplierType: "domestic" | "overseas" | "un";
  contactName: string;
  contactPhone: string;
  businessLicenseNo: string;
}

/**
 * 认证上下文值
 * Auth Context Value
 */
export interface AuthContextValue {
  /** 当前登录用户 */
  authUser: AuthUser | null;
  /** 是否为 VIP 会员 */
  isVip: boolean;
  /** 登录 */
  login: (email: string, password: string) => Promise<void>;
  /** 注册（含供应商绑定申请） */
  register: (form: SupplierClaimForm) => Promise<void>;
  /** 登出 */
  logout: () => void;
  /** 刷新认证状态 */
  refreshAuth: () => Promise<void>;
  /** 提交供应商绑定申请 */
  submitSupplierClaim: (claim: SupplierClaimForm) => Promise<void>;
  /** 供应商绑定申请消息 */
  claimMessage: string;
  /** 设置供应商绑定申请消息 */
  setClaimMessage: (msg: string) => void;
}
