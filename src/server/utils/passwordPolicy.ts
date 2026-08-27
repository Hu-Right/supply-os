/**
 * 密码强度校验（服务端副本）
 * Password strength validation
 *
 * @module server/utils/passwordPolicy
 * @description 统一密码强度规则：至少 8 位，必须包含字母和数字。
 *              与 src/shared/auth/passwordPolicy.ts 保持同步。
 */
import "server-only";

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordValidationResult {
  valid: boolean;
  /** 直接可展示的错误消息（中文） */
  message: string;
  /** i18n key（供前端 t() 翻译） */
  messageKey: string;
}

/**
 * 校验密码强度
 * Validate password strength
 *
 * 规则：
 * - 至少 8 个字符
 * - 必须包含至少一个英文字母 (a-z, A-Z)
 * - 必须包含至少一个数字 (0-9)
 */
export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: "密码至少 8 位，且需包含字母和数字", messageKey: "passwordTooShort" };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: "密码必须包含至少一个英文字母", messageKey: "passwordNeedsLetter" };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: "密码必须包含至少一个数字", messageKey: "passwordNeedsDigit" };
  }
  return { valid: true, message: "", messageKey: "" };
}
