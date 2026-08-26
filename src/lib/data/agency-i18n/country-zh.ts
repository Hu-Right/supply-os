/**
 * 国家名称中文映射 + 国际机构类型英文标签
 * Country Name Chinese Mapping & International Type English Labels
 *
 * @module server/data/agency-i18n/country-zh
 * @description COUNTRY_ZH 从主映射表 COUNTRY_NAME_ZH 展开，仅追加少量独有增量。
 *              ISO 3166 代码等通用条目已合并到 COUNTRY_NAME_ZH，消除数据漂移。
 */

import { COUNTRY_NAME_ZH } from "../countryNames";

// ── 国家名称中文映射（用于按国家聚合机构时的 i18n 生成）──
// 继承主映射表全部条目（含 ISO 代码、变体名等），仅追加以下独有增量：
// - "Ivory Coast"（COUNTRY_NAME_ZH 仅有 "Côte d'Ivoire"）
// - "Swaziland"（COUNTRY_NAME_ZH 仅有 "Eswatini"）
// - "Burma"（COUNTRY_NAME_ZH 仅有 "Myanmar" / "Myanmar/Burma"）
export const COUNTRY_ZH: Record<string, string> = {
  ...COUNTRY_NAME_ZH,
  "Ivory Coast": "科特迪瓦",
  "Swaziland": "斯威士兰",
  "Burma": "缅甸",
};

// ── INTL 类型英文标签（用于国家级聚合时的可读 display name）──
export const INTL_TYPE_EN: Record<string, string> = {
  "CITY_COUNCIL_INTL": "City Councils",
  "PROVINCIAL_GOVT_INTL": "Provincial Governments",
  "COUNCIL_INTL": "Councils",
  "MINISTRY_INTL": "Ministries",
  "DEPARTMENT_INTL": "Departments",
  "AUTHORITY_INTL": "Authorities",
  "COMMITTEE_INTL": "Committees",
  "COMMISSION_INTL": "Commissions",
  "BOARD_INTL": "Boards",
  "TRIBUNAL_INTL": "Tribunals",
  "UNIVERSITY_INTL": "Universities",
  "COLLEGE_INTL": "Colleges",
  "HOSPITAL_INTL": "Hospitals",
  "FOUNDATION_INTL": "Foundations",
  "FUND_INTL": "Funds",
  "ASSOCIATION_INTL": "Associations",
  "FEDERATION_INTL": "Federations",
  "UNION_INTL": "Unions",
  "SOCIETY_INTL": "Societies",
  "COOPERATIVE_INTL": "Cooperatives",
  "TRUST_INTL": "Trusts",
  "CORPORATION_INTL": "Corporations",
  "COMPANY_INTL": "Companies",
  "BANK_INTL": "Banks",
  "INSTITUTE_INTL": "Institutes",
  "INSTITUTION_INTL": "Institutions",
  "CENTER_INTL": "Centers",
  "BUREAU_INTL": "Bureaus",
  "AGENCY_INTL": "Agencies",
  "OFFICE_INTL": "Offices",
  "DIVISION_INTL": "Divisions",
  "COURT_INTL": "Courts",
  "PARLIAMENT_INTL": "Parliaments",
  "CONGRESS_INTL": "Congresses",
  "EMBASSY_INTL": "Embassies",
  "CONSULATE_INTL": "Consulates",
  "PROGRAMME_INTL": "Programmes",
  "NETWORK_INTL": "Networks",
  "NGO_INTL": "NGOs",
  "RED_CROSS_INTL": "Red Cross/Red Crescent",
  "POLICE_INTL": "Police",
  "INSPECTORATE_INTL": "Inspectorates",
  "REGULATORY_INTL": "Regulatory Authorities",
  "ELECTORAL_INTL": "Electoral Bodies",
  "WATER_INTL": "Water Authorities",
  "ENERGY_INTL": "Energy Authorities",
  "ROADS_INTL": "Roads Authorities",
};
