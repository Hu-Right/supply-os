/**
 * 国际认证标识常量
 * International Certification Constants
 *
 * @module shared/constants/certifications
 * @description 国际认证关键词列表与识别函数，供评分引擎、诊断引擎等共享消费。
 *              消除 scoring/index.ts 与 diagnosticEngine.ts 的双写重复。
 */

/** 国际认证关键词列表（用于区分"国际通用"与"国内"认证） */
export const INTL_CERT_KEYWORDS = [
  "ISO", "CE", "MDR", "UKCA", "UL", "FCC", "FDA", "CPC",
  "PSE", "MIC", "KC", "SABER", "BIS", "EAC", "RCM", "ISED",
  "CSA", "INMETRO", "TISI", "SNI", "SONCAP", "G-Mark",
  "IATF", "SA8000", "HACCP", "ISO22000", "ISO13485",
];

/**
 * 判断给定认证名称是否为国际认证
 * @param certName - 认证名称
 */
export function isIntlCert(certName: string): boolean {
  return INTL_CERT_KEYWORDS.some((kw) => certName.includes(kw));
}
