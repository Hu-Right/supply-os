/**
 * 机构名翻译辅助
 * Agency Translation Helpers
 *
 * @module server/services/notice-search/agencies/translate
 */
import "server-only";
import { COUNTRY_ZH } from "../../agency/index";

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

/** 国家名关键词映射 */
const COUNTRY_NAME_KW: Record<string, string> = {
  "AFGHANISTAN": "阿富汗", "ALBANIA": "阿尔巴尼亚", "ALGERIA": "阿尔及利亚",
  "ANGOLA": "安哥拉", "ARGENTINA": "阿根廷", "ARMENIA": "亚美尼亚",
  "AUSTRALIA": "澳大利亚", "AUSTRIA": "奥地利", "AZERBAIJAN": "阿塞拜疆",
  "BANGLADESH": "孟加拉国", "BELARUS": "白俄罗斯", "BELGIUM": "比利时",
  "BENIN": "贝宁", "BOLIVIA": "玻利维亚", "BOTSWANA": "博茨瓦纳",
  "BRAZIL": "巴西", "BRASIL": "巴西",
  "BURKINA FASO": "布基纳法索", "BURUNDI": "布隆迪", "CAMBODIA": "柬埔寨",
  "CAMEROON": "喀麦隆", "CANADA": "加拿大", "CHAD": "乍得",
  "CHILE": "智利", "CHINA": "中国", "COLOMBIA": "哥伦比亚",
  "CONGO": "刚果", "CROATIA": "克罗地亚", "CUBA": "古巴",
  "CYPRUS": "塞浦路斯", "CZECH": "捷克", "DENMARK": "丹麦",
  "DJIBOUTI": "吉布提", "ECUADOR": "厄瓜多尔", "EGYPT": "埃及",
  "ETHIOPIA": "埃塞俄比亚", "FIJI": "斐济", "FINLAND": "芬兰",
  "FRANCE": "法国", "GABON": "加蓬", "GEORGIA": "格鲁吉亚",
  "GERMANY": "德国", "DEUTSCH": "德国",
  "GHANA": "加纳", "GREECE": "希腊", "GUATEMALA": "危地马拉",
  "GUINEA": "几内亚", "GUYANA": "圭亚那", "HAITI": "海地",
  "HONDURAS": "洪都拉斯", "HUNGARY": "匈牙利", "INDIA": "印度",
  "INDONESIA": "印度尼西亚", "IRAN": "伊朗", "IRAQ": "伊拉克",
  "ISRAEL": "以色列", "ITALY": "意大利", "JAMAICA": "牙买加",
  "JAPAN": "日本", "JORDAN": "约旦", "KAZAKHSTAN": "哈萨克斯坦",
  "KENYA": "肯尼亚", "KOREA": "韩国", "KUWAIT": "科威特",
  "KYRGYZSTAN": "吉尔吉斯斯坦", "LAOS": "老挝", "LATVIA": "拉脱维亚",
  "LEBANON": "黎巴嫩", "LESOTHO": "莱索托", "LIBERIA": "利比里亚",
  "LIBYA": "利比亚", "LITHUANIA": "立陶宛", "MADAGASCAR": "马达加斯加",
  "MALAWI": "马拉维", "MALAYSIA": "马来西亚", "MALI": "马里",
  "MAURITANIA": "毛里塔尼亚", "MAURITIUS": "毛里求斯", "MEXICO": "墨西哥",
  "MOLDOVA": "摩尔多瓦", "MONGOLIA": "蒙古", "MONTENEGRO": "黑山",
  "MOROCCO": "摩洛哥", "MOZAMBIQUE": "莫桑比克", "MYANMAR": "缅甸",
  "BURMA": "缅甸",
  "NAMIBIA": "纳米比亚", "NEPAL": "尼泊尔", "NETHERLANDS": "荷兰",
  "HOLLAND": "荷兰",
  "NEW ZEALAND": "新西兰", "NICARAGUA": "尼加拉瓜", "NIGER": "尼日尔",
  "NIGERIA": "尼日利亚", "NORWAY": "挪威", "OMAN": "阿曼",
  "PAKISTAN": "巴基斯坦", "PANAMA": "巴拿马", "PARAGUAY": "巴拉圭",
  "PERU": "秘鲁", "PHILIPPINES": "菲律宾", "POLAND": "波兰",
  "PORTUGAL": "葡萄牙", "QATAR": "卡塔尔", "ROMANIA": "罗马尼亚",
  "RUSSIA": "俄罗斯", "RUSSIAN": "俄罗斯",
  "RWANDA": "卢旺达", "SAUDI": "沙特", "SENEGAL": "塞内加尔",
  "SERBIA": "塞尔维亚", "SIERRA LEONE": "塞拉利昂", "SINGAPORE": "新加坡",
  "SLOVAKIA": "斯洛伐克", "SLOVENIA": "斯洛文尼亚", "SOMALIA": "索马里",
  "SOUTH AFRICA": "南非", "SPAIN": "西班牙", "SRI LANKA": "斯里兰卡",
  "SUDAN": "苏丹", "SURINAME": "苏里南", "SWEDEN": "瑞典",
  "SWITZERLAND": "瑞士", "SYRIA": "叙利亚", "TAJIKISTAN": "塔吉克斯坦",
  "TANZANIA": "坦桑尼亚", "THAILAND": "泰国", "TOGO": "多哥",
  "TUNISIA": "突尼斯", "TURKEY": "土耳其", "TURKIYE": "土耳其",
  "TURKMENISTAN": "土库曼斯坦", "UGANDA": "乌干达", "UKRAINE": "乌克兰",
  "URUGUAY": "乌拉圭", "UZBEKISTAN": "乌兹别克斯坦", "VENEZUELA": "委内瑞拉",
  "VIETNAM": "越南", "YEMEN": "也门", "ZAMBIA": "赞比亚",
  "ZIMBABWE": "津巴布韦",
  "AFRICAN": "非洲", "EUROPEAN": "欧洲", "ASIAN": "亚洲",
};

/** 从机构名中提取国家名 */
export function extractCountryFromName(name: string): string | null {
  const upper = name.toUpperCase();
  const sortedKeywords = Object.entries(COUNTRY_NAME_KW)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [kw, zh] of sortedKeywords) {
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(upper)) return zh;
  }
  const isoMatch = upper.match(/[_\.]([A-Z]{2})(?:[_\.]|$)/);
  if (isoMatch) {
    const isoCode = isoMatch[1];
    const countryZh = COUNTRY_ZH[isoCode];
    if (countryZh) return countryZh;
  }
  const govMatch = upper.match(/GOV[._]([A-Z]{2})(?:[._]|$)/);
  if (govMatch) {
    const tld = govMatch[1];
    const countryZh = COUNTRY_ZH[tld];
    if (countryZh) return countryZh;
  }
  return null;
}
