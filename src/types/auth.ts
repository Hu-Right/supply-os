/**
 * 认证与用户身份类型
 * Auth & User Identity Types
 *
 * @module types/auth
 * @description 登录态、用户画像、供应商绑定状态等认证相关数据结构
 *              Authentication state, user profile, supplier claim binding
 */

/** 登录态用户快照（键名与服务端 lib/services/auth.ts 的 AuthUserResponse 同口径）。
 *  2026-10-28 命名红线②：本对象过去整块沿用 users.* 列名（has_subscription 等），
 *  因为服务端写的是 `json({ user: payload })`，门禁只看见外层 user 一键——现已改名，
 *  不保留 snake 旧键（旧 localStorage 快照里的 snake 键会在下次启动 refreshAuth 时被新响应覆盖）。
 *  服务端另发 accountStatus，本类型有意不声明（站内无消费方，避免给幻影字段开口子）。 */
export interface AuthUser {
  /** 内部用户 ID — 全系统唯一身份标识 */
  id: number;
  email: string;
  /** 对外展示名（昵称）。真实姓名不进入任何 API 响应（隐私收口） */
  nickname?: string;
  hasSubscription: boolean;
  supplierId?: number | null;
  /** 旧品类映射已退役，服务端恒返 null */
  supplierIndustryId?: number | null;
  /** 自由文本行业列已退役，服务端恒返 null */
  supplierIndustry?: string | null;
  /** 已绑定手机号（脱敏显示，如 138****8000） */
  phone?: string | null;
  /** 手机号是否已验证 */
  phoneVerified?: number;
  /** 邮箱是否已验证 */
  emailVerified?: number;
}
