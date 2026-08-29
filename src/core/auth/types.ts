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
 * 注册参数选项
 * #ARCH-004: 替代原 8 个位置参数，消除传参顺序错误风险
 */
export interface RegisterOptions {
  email?: string | null;
  password: string;
  displayName?: string;
  claim?: SupplierClaimForm;
  verifyCode?: string;
  invitationCode?: string;
  userType?: string;
  phone?: string;
}

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
  /** 认证初始化完成（localStorage 恢复 + refresh 完成），此前不应做路由守卫判断 */
  authReady: boolean;
  /** 认证操作加载中（登录/注册/刷新） */
  isAuthLoading: boolean;
  /** 登录（仅手机号） */
  login: (phone: string, password: string) => Promise<void>;
  /** 注册（options 对象模式，消除位置参数顺序依赖） */
  register: (options: RegisterOptions) => Promise<void>;
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
  /** 发送找回密码验证码，返回邮件发送状态 */
  sendResetCode: (identifier: string) => Promise<{ email_sent: boolean; support_hint: string | null }>;
  /** 重置密码（验证码+新密码），成功后自动登录 */
  resetPassword: (identifier: string, code: string, newPassword: string) => Promise<void>;
}
