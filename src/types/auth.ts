/**
 * 认证与用户身份类型
 * Auth & User Identity Types
 *
 * @module types/auth
 * @description 登录态、用户画像、供应商绑定状态等认证相关数据结构
 *              Authentication state, user profile, supplier claim binding
 */

export interface AuthUser {
  user_key: string;
  email: string;
  /** 对外展示名（昵称）。真实姓名不进入任何 API 响应（隐私收口） */
  nickname?: string;
  membership_tier?: "free" | "vip" | string;
  supplier_id?: number | null;
  supplier_industry_id?: number | null;
  supplier_industry?: string | null;
  /** 已绑定手机号（脱敏显示，如 138****8000） */
  phone?: string | null;
  /** 手机号是否已验证 */
  phone_verified?: number;
  /** 邮箱是否已验证 */
  email_verified?: number;
}
