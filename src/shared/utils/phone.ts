/**
 * 手机号公共工具（客户端/服务端共用，零依赖）
 *
 * @module shared/utils/phone
 * @description 全站手机号唯一口径的「轻量层」：
 *              - 存储格式统一 E.164（+8613800138000 / +85291234567）；
 *              - 真伪校验交给服务端 libphonenumber（lib/utils/phone.ts），
 *                客户端只做「看起来像不像手机号」与登录候选展开，避免把
 *                号码元数据打进客户端 bundle。
 *
 *              2026-11-18 之前全站写死 `^1[3-9]\d{9}$`（9 处复制），
 *              港澳台（+852/+853 8 位、+886 9 位）与海外号码一律注册不了。
 */

/** E.164：+ 加 7–15 位数字（首位非 0） */
export const E164_RE = /^\+[1-9]\d{6,14}$/;

export function isE164(value: string): boolean {
  return E164_RE.test(String(value ?? "").trim());
}

/**
 * 是否「看起来像手机号」（用于登录/找回区分手机号与邮箱）。
 * 不校验号码真伪：登录时用户可能输入各国本地格式，真伪由服务端归一化判定。
 */
export function looksLikePhone(value: string): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (v.startsWith("+")) return /^\+\d[\d\s().-]{5,}$/.test(v);
  if (/[a-zA-Z@]/.test(v)) return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

/**
 * 登录 / 找回密码时的手机号候选展开。
 *
 * 存量库里的号码是 E.164，但用户可能输入本地格式（大陆 11 位、港澳 8 位、
 * 台湾 9 位）。这里给出「这段数字可能是哪些 E.164」，由调用方按候选集查库，
 * 避免强迫用户在登录页再选一次国家码。
 */
export function phoneLookupCandidates(input: string): string[] {
  const v = String(input ?? "").trim();
  if (!v) return [];
  // 含字母/@ 的一定是邮箱或账号名，不能按数字抽出手机号候选
  if (/[a-zA-Z@]/.test(v)) return [];

  // 已带国家码：只认这一种写法
  if (v.startsWith("+")) {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15 ? [`+${digits}`] : [];
  }

  const digits = v.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return [];

  const out = new Set<string>();
  if (/^1[3-9]\d{9}$/.test(digits)) out.add(`+86${digits}`);
  if (digits.length === 8) {
    out.add(`+852${digits}`); // 香港
    out.add(`+853${digits}`); // 澳门
  }
  if (digits.length === 9 && digits.startsWith("9")) out.add(`+886${digits}`); // 台湾手机 9xx xxx xxx
  if (digits.length === 10 && digits.startsWith("0")) out.add(`+886${digits.slice(1)}`); // 台湾习惯写法 09xx...
  return [...out];
}
