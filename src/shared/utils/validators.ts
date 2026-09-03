/**
 * 客户端表单校验器（架构评估 C1：与 shared/auth/passwordPolicy 成对）
 *
 * @module shared/utils/validators
 * @description 纯函数校验器，与服务端 auth 路由的正则口径一致
 *              （服务端仍以 zod schema 为准，此处供客户端即时反馈使用）。
 */

/** 中国大陆手机号 */
export const MAINLAND_PHONE_RE = /^1[3-9]\d{9}$/;

/** 通用邮箱格式（与 auth 路由口径一致） */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isMainlandPhone(value: string): boolean {
  return MAINLAND_PHONE_RE.test(value);
}

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}
