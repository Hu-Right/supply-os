/**
 * 机构名翻译辅助
 * Agency Translation Helpers
 *
 * @module server/services/notice-search/agencies/translate
 */
import { countryZhOf, matchCountryZhInText } from "../../country/display";

/** 判断翻译是否需要修复 */
export function needsTranslationFix(s: string | undefined, agency: string): boolean {
  if (!s) return true;
  if (s === agency) return true;
  const englishLetters = (s.match(/[a-zA-Z]/g) || []).length;
  const chineseChars = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (englishLetters > chineseChars) return true;
  if (/[a-zA-Z]{4,}/.test(s)) return true;
  return false;
}

/** 类型关键词中文映射 */
const TYPE_ZH_KW: Array<[RegExp, string]> = [
  [/\bCommittee\b/i, "委员会"], [/\bCommission\b/i, "委员会"],
  [/\bBoard\b/i, "理事会"], [/\bCouncil\b/i, "议会"],
  [/\bTribunal\b/i, "法庭"], [/\bMinistry\b/i, "部"],
  [/\bDepartment\b/i, "部门"], [/\bAuthority\b/i, "管理局"],
  [/\bAgency\b/i, "机构"], [/\bBureau\b/i, "局"],
  [/\bOffice\b/i, "办公室"], [/\bDivision\b/i, "司"],
  [/\bUniversity\b/i, "大学"], [/\bCollege\b/i, "学院"],
  [/\bInstitute\b/i, "研究所"], [/\bInstitution\b/i, "机构"],
  [/\bHospital\b/i, "医院"], [/\bFoundation\b/i, "基金会"],
  [/\bFund\b/i, "基金"], [/\bTrust\b/i, "信托"],
  [/\bAssociation\b/i, "协会"], [/\bFederation\b/i, "联合会"],
  [/\bUnion\b/i, "联盟"], [/\bSociety\b/i, "学会"],
  [/\bCooperative\b/i, "合作社"], [/\bCorporation\b/i, "公司"],
  [/\bCompany\b/i, "公司"], [/\bBank\b/i, "银行"],
  [/\bCenter\b/i, "中心"], [/\bCentre\b/i, "中心"],
  [/\bCourt\b/i, "法院"], [/\bParliament\b/i, "议会"],
  [/\bCongress\b/i, "国会"], [/\bEmbassy\b/i, "大使馆"],
  [/\bConsulate\b/i, "领事馆"], [/\bPolice\b/i, "警察"],
  [/\bInspectorate\b/i, "监察"], [/\bRegulatory\b/i, "监管"],
  [/\bElectoral\b/i, "选举"], [/\bWater\b/i, "水务"],
  [/\bElectricity\b/i, "电力"], [/\bEnergy\b/i, "能源"],
  [/\bRoads\b/i, "道路"], [/\bHighway\b/i, "公路"],
  [/\bNGO\b/i, "非政府组织"], [/\bNetwork\b/i, "网络"],
  [/\bProgramme\b/i, "项目"], [/\bProgram\b/i, "项目"],
];

/** 从关键词构建中文翻译 */
export function buildZhFromKeywords(name: string): string | null {
  for (const [re, zh] of TYPE_ZH_KW) {
    if (re.test(name)) return zh;
  }
  return null;
}

/** 国家名关键词映射已删：一律走 country_aliases（matchCountryZhInText），不再在机构模块内维护静态国家字典。 */

/** 从机构名中提取国家名（表驱动：先按国家词形包含匹配，再退 ISO/ccTLD，均查归一表）。 */
export function extractCountryFromName(name: string): string | null {
  const phraseZh = matchCountryZhInText(name);
  if (phraseZh) return phraseZh;
  const upper = String(name ?? "").toUpperCase();
  const isoMatch = upper.match(/[_.]([A-Z]{2})(?:[_.]|$)/);
  if (isoMatch) {
    const countryZh = countryZhOf(isoMatch[1]);
    if (countryZh) return countryZh;
  }
  const govMatch = upper.match(/GOV[._]([A-Z]{2})(?:[._]|$)/);
  if (govMatch) {
    const countryZh = countryZhOf(govMatch[1]);
    if (countryZh) return countryZh;
  }
  return null;
}
