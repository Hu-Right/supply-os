/**
 * 手机号归一化（服务端唯一实现）
 *
 * @module lib/utils/phone
 * @description 所有写库/查库的手机号都必须先经过本模块，统一成 E.164：
 *              注册、发码、绑定、换绑、找回密码、登录查库。
 *              真伪校验用 libphonenumber（完整元数据，仅服务端引入）。
 */
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** 未带国家码时的默认区号（存量用户与绝大多数注册来自中国大陆） */
export const DEFAULT_PHONE_COUNTRY: CountryCode = "CN";

/**
 * 任意输入 → E.164；不合法返回 null。
 * 接受 `+8613800138000`、`13800138000`（默认区号 CN）、`91234567` + 指定地区。
 */
export function normalizePhone(input: string, defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(raw, raw.startsWith("+") ? undefined : defaultCountry);
  if (!parsed) return null;
  return parsed.isValid() ? parsed.number : null;
}

/** E.164 → ISO 国家码（用于短信通道路由/展示） */
export function phoneCountryOf(e164: string): CountryCode | undefined {
  return parsePhoneNumberFromString(String(e164 ?? "").trim())?.country;
}

/** 是否中国大陆号码（+86） */
export function isMainlandE164(e164: string): boolean {
  return String(e164 ?? "").startsWith("+86");
}

/**
 * 短信网关的号码形态：阿里云国内号码不带区号，国际号码带区号但不带 `+`。
 * `+8613800138000` → `13800138000`；`+85291234567` → `85291234567`。
 */
export function smsTargetOf(e164: string): string {
  const digits = String(e164 ?? "").replace(/\D/g, "");
  return String(e164 ?? "").startsWith("+86") ? digits.slice(2) : digits;
}