/**
 * 采购机构下拉数据源
 * Agency dropdown data source
 *
 * @module server/services/notice-search/agencies
 * @description 机构下拉列表的查询、归一化去重、别名映射、i18n 多语言、类型聚合与兜底归并。
 *              每日凌晨 5 点定时刷新，启动时预热。
 *              P2-5 修复：Promise 去重——并发请求共享同一个刷新 Promise。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { AgencyCacheItem } from "./types";
import { translateByPattern, classifyAgencyType, COUNTRY_ZH } from "../agencyI18n";

let noticeAgenciesCache: { data: AgencyCacheItem[]; timestamp: number } | null = null;
const AGENCIES_CACHE_TTL = 10 * 60 * 1000; // 10 分钟

// P2-5 修复：机构缓存刷新 Promise 去重——并发请求共享同一个刷新 Promise
let _pendingAgenciesRefresh: Promise<AgencyCacheItem[]> | null = null;

// ── typeKey → SQL LIKE 模式映射（用于 MySQL 路径高效匹配大型聚合组）──
const TYPE_KEY_SQL_PATTERNS: Record<string, string> = {
  // 巴西
  "MUNICIPIO_BR": "MUNICIPIO %",
  "FUNDO_BR": "FUNDO %",
  "SECRETARIA_BR": "SECRETARIA %",
  "CAMARA_BR": "CAMARA %",
  "FUNDACAO_BR": "FUNDACAO %",
  "INSTITUTO_BR": "INSTITUTO %",
  "CONSORCIO_BR": "CONSORCIO %",
  "TRIBUNAL_BR": "%TRIBUNAL%",
  "SERVICO_BR": "SERVICO %",
  "DEPARTAMENTO_BR": "%DEPARTAMENTO%",
  "COMPANHIA_BR": "COMPANHIA %",
  "ASSOC_BR": "ASSOC%",
  "EMPRESA_BR": "EMPRESA %",
  "MINISTERIO_BR": "MINISTERIO %",
  "HOSPITAL_BR": "HOSPITAL %",
  "ESTADO_BR": "ESTADO %",
  "AGENCIA_BR": "AGENCIA %",
  "BOMBEIROS_BR": "%BOMBEIROS%",
  "SANEAMENTO_BR": "%SANEAMENTO%",
  "MILITARY_BR": "COMANDO %",
  "UNIVERSITY_BR": "UNIVERSIDADE %",
  // 肯尼亚
  "COUNTY_KE": "%COUNTY%",
  "NGCDF_KE": "%NG%CDF%",
  "SCHOOL_KE": "%SCHOOL%",
  // 国际
  "UN_SYSTEM": "UN%",
  "MINISTRY_INTL": "%MINISTRY OF%",
  "CITY_COUNCIL_INTL": "%COUNCIL%",
  "COUNCIL_INTL": "%COUNCIL%",
  "PROVINCIAL_GOVT_INTL": "%PROVINCIAL%GOVERNMENT%",
  "DEPARTMENT_INTL": "%DEPARTMENT OF%",
  "AUTHORITY_INTL": "%AUTHORITY%",
  "COMMITTEE_INTL": "%COMMITTEE%",
  "COMMISSION_INTL": "%COMMISSION%",
  "BOARD_INTL": "%BOARD%",
  "TRIBUNAL_INTL": "%TRIBUNAL%",
  "UNIVERSITY_INTL": "%UNIVERSITY%",
  "COLLEGE_INTL": "%COLLEGE%",
  "HOSPITAL_INTL": "%HOSPITAL%",
  "FOUNDATION_INTL": "%FOUNDATION%",
  "FUND_INTL": "%FUND%",
  "ASSOCIATION_INTL": "%ASSOCIATION%",
  "FEDERATION_INTL": "%FEDERATION%",
  "UNION_INTL": "%UNION%",
  "SOCIETY_INTL": "%SOCIETY%",
  "COOPERATIVE_INTL": "%COOPERATIVE%",
  "TRUST_INTL": "%TRUST%",
  "CORPORATION_INTL": "%CORPORATION%",
  "COMPANY_INTL": "%LIMITED%",
  "BANK_INTL": "%BANK%",
  "INSTITUTE_INTL": "%INSTITUTE%",
  "INSTITUTION_INTL": "%INSTITUTION%",
  "CENTER_INTL": "%CENTER%",
  "BUREAU_INTL": "%BUREAU%",
  "AGENCY_INTL": "%AGENCY%",
  "OFFICE_INTL": "%OFFICE%",
  "DIVISION_INTL": "%DIVISION%",
  "COURT_INTL": "%COURT%",
  "PARLIAMENT_INTL": "%PARLIAMENT%",
  "CONGRESS_INTL": "%CONGRESS%",
  "EMBASSY_INTL": "%EMBASSY%",
  "CONSULATE_INTL": "%CONSULATE%",
  "PROGRAMME_INTL": "%PROGRAM%",
  "NETWORK_INTL": "%NETWORK%",
  "NGO_INTL": "%NGO%",
  "RED_CROSS_INTL": "%RED CROSS%",
  "POLICE_INTL": "%POLICE%",
  "INSPECTORATE_INTL": "%INSPECTORATE%",
  "REGULATORY_INTL": "%REGULATORY%",
  "ELECTORAL_INTL": "%ELECTORAL%",
  "WATER_INTL": "%WATER%",
  "ENERGY_INTL": "%ELECTRICITY%",
  "ROADS_INTL": "%ROADS%",
  "DEV_BANKS": "%",
};

/** 从数据库重新查询并刷新机构缓存（归一化去重 + 别名映射 + i18n，返回全量数据） */
export async function refreshNoticeAgencies(pool: Pool): Promise<AgencyCacheItem[]> {
  // 1) 加载机构别名映射表（alias → canonical + name_i18n）
  const aliasMap = new Map<string, { canonical: string; i18n: Record<string, string> | null }>();
  try {
    const [aliasRows] = await pool.query("SELECT canonical, alias, name_i18n FROM crm_agency_aliases");
    for (const row of aliasRows as RowDataPacket[]) {
      const canonical = String(row.canonical || "").trim();
      let i18n: Record<string, string> | null = null;
      if (row.name_i18n) {
        try {
          i18n = typeof row.name_i18n === "string" ? JSON.parse(row.name_i18n) : row.name_i18n;
        } catch { /* JSON 解析失败则保持 null */ }
      }
      aliasMap.set(String(row.alias || "").trim().toUpperCase(), { canonical, i18n });
    }
  } catch {
    // 表不存在或查询失败：静默降级，仅走大小写归一化
  }

  // 2) 查询原始机构数据（含国家字段，用于按国家级聚合 INTL 类型机构）
  // 修复：与搜索路径口径统一，只用 deadline_sec 实时判断，移除 is_active 依赖
  const [rows] = await pool.query(
    `SELECT n.agency, ANY_VALUE(n.country) AS country, COUNT(*) AS cnt FROM crm_bid_notices n
     WHERE (n.deadline_ts IS NULL OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))
       AND n.agency IS NOT NULL AND n.agency <> ''
     GROUP BY n.agency ORDER BY cnt DESC`
  );

  // 3) 归一化去重：TRIM + 大写归并 + 别名映射 + i18n 合并
  const merged = new Map<string, AgencyCacheItem>();
  const canonicalToOriginals = new Map<string, string[]>();
  const canonicalToCountry = new Map<string, string>();
  for (const row of rows as RowDataPacket[]) {
    const raw = String(row.agency || "").trim();
    const country = String(row.country || "").trim();
    if (!raw) continue;
    const upperKey = raw.toUpperCase();
    const aliasEntry = aliasMap.get(upperKey);
    const canonical = aliasEntry?.canonical || raw;
    const i18n = aliasEntry?.i18n || null;
    const mergeKey = canonical.toUpperCase();
    const existing = merged.get(mergeKey);
    if (existing) {
      existing.count += Number(row.cnt);
      if (!existing.i18n && i18n) existing.i18n = i18n;
    } else {
      merged.set(mergeKey, { agency: canonical, count: Number(row.cnt), i18n });
    }
    const originals = canonicalToOriginals.get(mergeKey) || [];
    originals.push(raw);
    canonicalToOriginals.set(mergeKey, originals);
    if (country && !canonicalToCountry.has(mergeKey)) {
      canonicalToCountry.set(mergeKey, country);
    }
  }

  // 3.5) 对无 i18n 的条目，尝试模式化翻译兜底
  for (const [, item] of merged) {
    if (!item.i18n) {
      const patternResult = translateByPattern(item.agency);
      if (patternResult) {
        if (patternResult.canonical !== item.agency && !aliasMap.has(item.agency.toUpperCase())) {
          const oldMergeKey = item.agency.toUpperCase();
          const oldOriginals = canonicalToOriginals.get(oldMergeKey);
          const oldCountry = canonicalToCountry.get(oldMergeKey);
          item.agency = patternResult.canonical;
          const newMergeKey = item.agency.toUpperCase();
          if (oldOriginals && !canonicalToOriginals.has(newMergeKey)) {
            canonicalToOriginals.set(newMergeKey, oldOriginals);
          }
          if (oldCountry && !canonicalToCountry.has(newMergeKey)) {
            canonicalToCountry.set(newMergeKey, oldCountry);
          }
        }
        if (patternResult.i18n.zh !== item.agency) {
          item.i18n = patternResult.i18n;
        }
      }
    }
  }

  // 3.5.1) 去重：步骤 3.5 可能使多个条目拥有相同的 agency 值，需要合并
  // 同时重建 canonicalToCountry 映射，确保后续步骤能正确获取国家信息
  const deduped = new Map<string, AgencyCacheItem>();
  const dedupedOriginals = new Map<string, string[]>();
  const dedupedCountry = new Map<string, string>();
  for (const [mergeKey, item] of merged) {
    const newKey = item.agency.toUpperCase();
    const existing = deduped.get(newKey);
    if (existing) {
      // 合并到已存在的条目
      existing.count += item.count;
      if (!existing.i18n && item.i18n) existing.i18n = item.i18n;
      const existingOriginals = dedupedOriginals.get(newKey) || [];
      const newOriginals = canonicalToOriginals.get(mergeKey) || [];
      dedupedOriginals.set(newKey, [...existingOriginals, ...newOriginals]);
      // 国家：优先保留已有的
    } else {
      deduped.set(newKey, item);
      dedupedOriginals.set(newKey, canonicalToOriginals.get(mergeKey) || []);
      const country = canonicalToCountry.get(mergeKey);
      if (country) dedupedCountry.set(newKey, country);
    }
  }
  // 用去重后的数据替换
  canonicalToOriginals.clear();
  for (const [k, v] of dedupedOriginals) canonicalToOriginals.set(k, v);
  canonicalToCountry.clear();
  for (const [k, v] of dedupedCountry) canonicalToCountry.set(k, v);

  // 3.6) 类型聚合：将同类型机构合并（如 1922 个巴西市政府 → 1 个「巴西各市政府」）
  const typeAggregated = new Map<string, AgencyCacheItem>();
  for (const [mergeKey, item] of deduped) {
    const country = canonicalToCountry.get(mergeKey) || undefined;
    const typeInfo = classifyAgencyType(item.agency, country);
    if (typeInfo) {
      const existing = typeAggregated.get(typeInfo.typeKey);
      const originals = canonicalToOriginals.get(mergeKey) || [];
      if (existing) {
        existing.count += item.count;
        if (existing.originalAgencies) {
          existing.originalAgencies.push(...originals);
        }
      } else {
        typeAggregated.set(typeInfo.typeKey, {
          agency: typeInfo.typeKey,
          count: item.count,
          i18n: typeInfo.i18n,
          originalAgencies: [...originals],
          agencyGroup: typeInfo.typeKey,
          sqlPattern: TYPE_KEY_SQL_PATTERNS[typeInfo.typeKey],
        });
      }
    } else {
      const key = item.agency.toUpperCase();
      const originals = canonicalToOriginals.get(mergeKey) || canonicalToOriginals.get(key) || [];
      typeAggregated.set(key, { ...item, originalAgencies: originals });
    }
  }

  // 3.6.1) 强制国家级聚合：巴西/肯尼亚的所有子类型组合并为单一"XX各机构"
  // 解决问题：TYPE_PATTERNS 为巴西创建 20+ 个细分类型组（市政府/基金/厅局/议会/法院...），
  // 每个都是独立条目，导致下拉列表中仍然出现大量巴西相关选项
  const FORCE_COUNTRY_COUNTRIES = new Set(["Brazil", "Kenya"]);
  const FORCE_COUNTRY_ZH: Record<string, string> = { "Brazil": "巴西", "Kenya": "肯尼亚" };
  const FORCE_COUNTRY_SQL: Record<string, string> = {
    "Brazil": "%", // 匹配所有巴西机构（LIKE '%' 等于不过滤，但配合 is_active=1 使用）
    "Kenya": "%",
  };

  const forceCountryBuckets = new Map<string, AgencyCacheItem>();
  for (const [key, item] of typeAggregated) {
    // 判断是否属于需要强制合并的国家
    let forceCountry: string | null = null;

    // 策略 1: typeKey 以 _BR / _KE 结尾（TYPE_PATTERNS 产生的子类型组）
    if (key.endsWith("_BR")) forceCountry = "Brazil";
    else if (key.endsWith("_KE")) forceCountry = "Kenya";

    // 策略 2: 从 canonicalToCountry 查找（独立条目）
    if (!forceCountry) {
      const country = canonicalToCountry.get(key) || canonicalToCountry.get(key.toUpperCase());
      if (country && FORCE_COUNTRY_COUNTRIES.has(country)) forceCountry = country;
    }

    // 策略 3: 从 originalAgencies 反查国家
    if (!forceCountry && item.originalAgencies?.length) {
      for (const orig of item.originalAgencies) {
        const c = canonicalToCountry.get(orig.toUpperCase());
        if (c && FORCE_COUNTRY_COUNTRIES.has(c)) {
          forceCountry = c;
          break;
        }
      }
    }

    if (forceCountry) {
      const bucketKey = `FORCE_COUNTRY_${forceCountry}`;
      const existing = forceCountryBuckets.get(bucketKey);
      if (existing) {
        existing.count += item.count;
        if (existing.originalAgencies && item.originalAgencies) {
          existing.originalAgencies.push(...item.originalAgencies);
        }
      } else {
        forceCountryBuckets.set(bucketKey, {
          agency: bucketKey,
          count: item.count,
          i18n: { zh: `${FORCE_COUNTRY_ZH[forceCountry]}各机构` },
          originalAgencies: item.originalAgencies ? [...item.originalAgencies] : [],
          agencyGroup: bucketKey,
          sqlPattern: FORCE_COUNTRY_SQL[forceCountry],
        });
      }
    }
  }

  // 用国家级桶替换原始条目
  for (const [key] of typeAggregated) {
    let isForceCountry = false;
    if (key.endsWith("_BR") || key.endsWith("_KE")) isForceCountry = true;
    if (!isForceCountry) {
      const country = canonicalToCountry.get(key) || canonicalToCountry.get(key.toUpperCase());
      if (country && FORCE_COUNTRY_COUNTRIES.has(country)) isForceCountry = true;
    }
    if (!isForceCountry) {
      const item = typeAggregated.get(key)!;
      if (item.originalAgencies?.length) {
        for (const orig of item.originalAgencies) {
          const c = canonicalToCountry.get(orig.toUpperCase());
          if (c && FORCE_COUNTRY_COUNTRIES.has(c)) { isForceCountry = true; break; }
        }
      }
    }
    if (isForceCountry) typeAggregated.delete(key);
  }
  for (const [key, item] of forceCountryBuckets) {
    typeAggregated.set(key, item);
  }

  // 3.7) 兜底聚合：将公告数极少的零散机构按国家归并为"XX国各机构"
  const AGENCY_MIN_COUNT = 5;
  const finalAggregated = new Map<string, AgencyCacheItem>();
  const orphanByCountry = new Map<string, AgencyCacheItem>();

  // 辅助函数：从 typeKey 中提取国家名（如 "Uganda Committees" → "Uganda"）
  const extractCountryFromTypeKey = (typeKey: string): string | null => {
    const parts = typeKey.split(' ');
    if (parts.length >= 2) {
      const countryName = parts[0];
      if (COUNTRY_ZH[countryName]) return countryName;
    }
    return null;
  };

  for (const [key, item] of typeAggregated) {
    if (item.count > AGENCY_MIN_COUNT) {
      finalAggregated.set(key, item);
      continue;
    }
    let country = canonicalToCountry.get(key.toUpperCase()) || "";
    if (!country) {
      // 尝试从 typeKey 中提取国家（如 "Uganda Committees" → "Uganda"）
      country = extractCountryFromTypeKey(key) || "";
    }
    if (!country && item.originalAgencies?.length) {
      // 尝试从原始机构名中获取国家
      for (const orig of item.originalAgencies) {
        const c = canonicalToCountry.get(orig.toUpperCase());
        if (c) {
          country = c;
          break;
        }
      }
    }
    const countryZh = COUNTRY_ZH[country];
    if (countryZh) {
      const bucketKey = `ORPHAN_${country}`;
      const existing = orphanByCountry.get(bucketKey);
      if (existing) {
        existing.count += item.count;
        if (existing.originalAgencies && item.originalAgencies) {
          existing.originalAgencies.push(...item.originalAgencies);
        }
      } else {
        orphanByCountry.set(bucketKey, {
          agency: bucketKey,
          count: item.count,
          i18n: { zh: `${countryZh}各机构` },
          originalAgencies: item.originalAgencies ? [...item.originalAgencies] : [],
          agencyGroup: bucketKey,
        });
      }
    } else {
      const existing = orphanByCountry.get("ORPHAN_OTHER");
      if (existing) {
        existing.count += item.count;
        if (existing.originalAgencies && item.originalAgencies) {
          existing.originalAgencies.push(...item.originalAgencies);
        }
      } else {
        orphanByCountry.set("ORPHAN_OTHER", {
          agency: "ORPHAN_OTHER",
          count: item.count,
          i18n: { zh: "其他机构" },
          originalAgencies: item.originalAgencies ? [...item.originalAgencies] : [],
          agencyGroup: "ORPHAN_OTHER",
        });
      }
    }
  }

  for (const [key, item] of orphanByCountry) {
    finalAggregated.set(key, item);
  }

  // 3.8) 汉化补全：确保所有条目都有真正的中文翻译
  const needsTranslationFix = (s: string | undefined, agency: string): boolean => {
    if (!s) return true;
    if (s === agency) return true;
    const englishLetters = (s.match(/[a-zA-Z]/g) || []).length;
    const chineseChars = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (englishLetters > chineseChars) return true;
    if (/[a-zA-Z]{4,}/.test(s)) return true;
    return false;
  };

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

  const buildZhFromKeywords = (name: string): string | null => {
    for (const [re, zh] of TYPE_ZH_KW) {
      if (re.test(name)) return zh;
    }
    return null;
  };

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

  const extractCountryFromName = (name: string): string | null => {
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
  };

  const resolveCountryZh = (key: string, item: AgencyCacheItem): string | null => {
    let country = canonicalToCountry.get(key.toUpperCase()) || "";
    if (country) {
      const zh = COUNTRY_ZH[country];
      if (zh) return zh;
    }
    if (key.startsWith("ORPHAN_")) {
      const extracted = key.slice(7);
      if (extracted !== "OTHER") {
        const zh = COUNTRY_ZH[extracted];
        if (zh) return zh;
      }
    }
    if (item.originalAgencies?.length) {
      for (const orig of item.originalAgencies) {
        const c = canonicalToCountry.get(orig.toUpperCase());
        if (c) {
          const zh = COUNTRY_ZH[c];
          if (zh) return zh;
        }
      }
    }
    const nameZh = extractCountryFromName(item.agency);
    if (nameZh) return nameZh;
    if (item.originalAgencies?.length) {
      for (const orig of item.originalAgencies) {
        const zh = extractCountryFromName(orig);
        if (zh) return zh;
      }
    }
    return null;
  };

  for (const [key, item] of finalAggregated) {
    const zh = item.i18n?.zh;
    const needsFix = needsTranslationFix(zh, item.agency);
    if (!needsFix) continue;

    const countryZh = resolveCountryZh(key, item);
    if (countryZh) {
      const typeZh = buildZhFromKeywords(item.agency);
      item.i18n = { ...item.i18n, zh: typeZh ? `${countryZh}${typeZh}` : `${countryZh}各机构` };
    } else {
      const typeZh = buildZhFromKeywords(item.agency);
      if (typeZh) {
        item.i18n = { ...item.i18n, zh: typeZh };
      } else {
        const agencyName = item.agency;
        if (/[_\.]/.test(agencyName)) {
          const codePart = agencyName.split(/[_\.]/)[0];
          const codeTypeZh = buildZhFromKeywords(codePart);
          if (codeTypeZh) {
            item.i18n = { ...item.i18n, zh: `${codeTypeZh}（采购系统）` };
          } else {
            item.i18n = { ...item.i18n, zh: "政府采购系统" };
          }
        } 
        else if (/\b(DE|DA|DO|DOS|DAS|LA|EL|LES|DES|DU|ET|AL|Y|E)\b/i.test(agencyName)) {
          const typeZh = buildZhFromKeywords(agencyName);
          if (typeZh) {
            item.i18n = { ...item.i18n, zh: typeZh };
          } else {
            if (/\b(FEDERAL|JUDICIAL|COURT|TRIBUNAL|JUSTIÇA|JUSTICIA)\b/i.test(agencyName)) {
              item.i18n = { ...item.i18n, zh: "司法机构" };
            } else {
              item.i18n = { ...item.i18n, zh: "政府机构" };
            }
          }
        } 
        else {
          item.i18n = { ...item.i18n, zh: "政府机构" };
        }
      }
    }
  }

  // 4) 按合并后计数降序排列，返回全量数据
  const data = Array.from(finalAggregated.values())
    .sort((a, b) => b.count - a.count);
  noticeAgenciesCache = { data, timestamp: Date.now() };
  return data;
}

/** 读取机构缓存，按 locale 解析翻译名 */
export async function getNoticeAgencies(
  pool: Pool,
  locale?: string,
): Promise<Array<{ agency: string; count: number; agency_i18n?: string }>> {
  const cacheValid = noticeAgenciesCache && Date.now() - noticeAgenciesCache.timestamp < AGENCIES_CACHE_TTL;
  let items: AgencyCacheItem[];
  if (cacheValid) {
    items = noticeAgenciesCache!.data;
  } else {
    // P2-5: 复用已有的刷新 Promise，避免并发重复执行
    if (!_pendingAgenciesRefresh) {
      _pendingAgenciesRefresh = refreshNoticeAgencies(pool).finally(() => {
        _pendingAgenciesRefresh = null;
      });
    }
    items = await _pendingAgenciesRefresh;
  }
  const lang = locale?.toLowerCase();
  if (!lang || lang === "en") {
    return items.map(({ agency, count }) => ({ agency, count }));
  }
  return items.map(({ agency, count, i18n }) => {
    const translated = i18n?.[lang];
    const isValidTranslation = translated && translated !== agency;
    return isValidTranslation ? { agency, count, agency_i18n: translated } : { agency, count };
  });
}

/** 获取机构缓存原始数据（供 searchNotices 内部使用） */
export function getAgencyCacheData(): AgencyCacheItem[] | null {
  return noticeAgenciesCache?.data ?? null;
}

/** 清除机构缓存（测试辅助） */
export function clearAgenciesCache(): void {
  noticeAgenciesCache = null;
  _pendingAgenciesRefresh = null;
}
