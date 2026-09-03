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

/**
 * 姓名掩码：中文/单词姓名保留首字符（张三丰 → 张**）；多词姓名保留各词首字母（John Smith → J*** S***）。
 * 用途：真实姓名（display_name）在窗口期兜底展示与管理侧输出前的脱敏，任何接口不得返回姓名明文。
 */
export function maskName(raw: unknown): string {
  const name = String(raw || "").trim();
  if (!name) return "";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return parts.map((p) => p.charAt(0) + "***").join(" ");
  }
  if (name.length === 1) return name;
  return name.charAt(0) + "*".repeat(Math.min(name.length - 1, 2));
}

// 逗号/顿号等分隔的原始字符串切分为去空数组
export function splitListField(raw: unknown): string[] {
  return String(raw || "")
    .split(/[,，、;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
