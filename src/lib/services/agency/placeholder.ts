/**
 * 采购平台占位名识别。
 *
 * 这些值来自 source 页面把平台名写进 buyer 字段，不是采购机构；
 * 不应参与机构类型聚合，也不应作为对外 buyer_name 展示。
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
]);

const PLACEHOLDER_RE = /(e-?procurement|procurement\s+(?:system|portal)|contracts?[_\s-]?finder|tenders?\.?gov|zakupki|operator\s+seap|avenue-web|error\s+500)/i;

export function isAgencyPlaceholder(name: string): boolean {
  const normalized = name.trim().replace(/\s+/g, " ").toUpperCase();
  if (!normalized) return false;
  if (EXACT.has(normalized)) return true;
  return PLACEHOLDER_RE.test(name);
}
