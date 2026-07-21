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
  display_name?: string;
  membership_tier?: "free" | "vip" | string;
  supplier_id?: number | null;
  supplier_industry_id?: number | null;
  supplier_industry?: string | null;
}
