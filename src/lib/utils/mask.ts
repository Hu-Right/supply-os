/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
export function maskPhone(raw: unknown): string {
  const p = String(raw || "").trim();
  if (!p) return "";
  if (p.length < 8) return p.slice(0, 2) + "****";
  return p.slice(0, 3) + "****" + p.slice(-4);
}

export function maskEmail(raw: unknown): string {
  const e = String(raw || "").trim();
  if (!e) return "";
  const at = e.indexOf("@");
  if (at <= 0) return "***";
  return e.slice(0, Math.min(2, at)) + "***" + e.slice(at);
}

// 逗号/顿号等分隔的原始字符串切分为去空数组
export function splitListField(raw: unknown): string[] {
  return String(raw || "")
    .split(/[,，、;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
