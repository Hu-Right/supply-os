/**
 * 采购平台占位名与买家噪声名识别。
 *
 * 两类值都不来自真实采购机构，不应参与机构类型聚合，也不应作为对外 buyer_name 展示：
 * ① 平台占位名——source 页面把平台名/平台码写进 buyer 字段；
 * ② 爬虫噪声名（2026-10-30 剔除口径）——错误页标题（"Error 500..."）、URL、
 *    纯数字/编号、控制字符、通用标签（"Nonprofit organization"）。
 * 注意：判定作用于别名解析之后的 canonical——别名把噪声名映射到真名属运维修正，放行
 * （notice-core normalizeBuyerCountry 的调用序保证）。
 */
const EXACT = new Set([
  "SAM",
  "EPROCURE_GOV_IN",
  "ETENDERS_GOV_ZA",
  "CONTRACTS_FINDER",
  "TENDERSGE",
  "ZAKUPKI_OKMOT_POPP",
  "OPERATOR SEAP",
  "AVENUE-WEB SYSTÈMES",
  "MONGOLIA E-PROCUREMENT SYSTEM (TENDER.GOV.MN)",
  "GOVERNMENT PROCUREMENT PORTAL OF THE REPUBLIC OF KAZAKHSTAN",
  "EPROCUREMENT.GOV.TJ",
  "NONPROFIT ORGANIZATION",
]);

const PLACEHOLDER_RE = /(e-?procurement|procurement\s+(?:system|portal)|contracts?[_\s-]?finder|tenders?\.?gov|zakupki|operator\s+seap|avenue-web|error\s+500|https?:\/\/|www\.)/i;

export function isAgencyPlaceholder(name: string): boolean {
  const normalized = name.trim().replace(/\s+/g, " ").toUpperCase();
  if (!normalized) return false;
  if (EXACT.has(normalized)) return true;
  if (PLACEHOLDER_RE.test(name)) return true;
  // 纯数字/编号（"113"、"2026/001"）：不是机构名
  if (/^[\d\s.,:/()\-–—]+$/.test(normalized)) return true;
  // 控制字符：爬虫解析产物，非可展示名
  if (/[\u0000-\u0008\u000e-\u001f]/.test(name)) return true;
  return false;
}
