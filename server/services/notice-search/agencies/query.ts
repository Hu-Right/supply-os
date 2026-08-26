/**
 * 机构数据查询与聚合
 * Agency Query & Aggregation
 *
 * @module server/services/notice-search/agencies/query
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { AgencyCacheItem } from "../types";
import { translateByPattern, classifyAgencyType, COUNTRY_ZH } from "../../agency/index";
import { ACTIVE_NOTICE_WHERE } from "../../../utils/notice-expired";
import { setAgencyCacheData } from "./cache";
import { needsTranslationFix, buildZhFromKeywords, extractCountryFromName } from "./translate";

/** typeKey → SQL LIKE 模式映射 */
export const TYPE_KEY_SQL_PATTERNS: Record<string, string> = {
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

/** 从数据库重新查询并刷新机构缓存 */
export async function refreshNoticeAgencies(pool: Pool): Promise<AgencyCacheItem[]> {
  // 1) 加载机构别名映射表
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
    // 表不存在或查询失败：静默降级
  }

  // 2) 查询原始机构数据
  const [rows] = await pool.query(
    `SELECT n.agency, ANY_VALUE(n.country) AS country, COUNT(*) AS cnt FROM crm_bid_notices n
     WHERE ${ACTIVE_NOTICE_WHERE}
       AND n.agency IS NOT NULL AND n.agency <> ''
     GROUP BY n.agency ORDER BY cnt DESC`
  );

  // 3) 归一化去重
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

  // 3.5) 模式化翻译兜底
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

  // 3.5.1) 去重
  const deduped = new Map<string, AgencyCacheItem>();
  const dedupedOriginals = new Map<string, string[]>();
  const dedupedCountry = new Map<string, string>();
  for (const [mergeKey, item] of merged) {
    const newKey = item.agency.toUpperCase();
    const existing = deduped.get(newKey);
    if (existing) {
      existing.count += item.count;
      if (!existing.i18n && item.i18n) existing.i18n = item.i18n;
      const existingOriginals = dedupedOriginals.get(newKey) || [];
      const newOriginals = canonicalToOriginals.get(mergeKey) || [];
      dedupedOriginals.set(newKey, [...existingOriginals, ...newOriginals]);
    } else {
      deduped.set(newKey, item);
      dedupedOriginals.set(newKey, canonicalToOriginals.get(mergeKey) || []);
      const country = canonicalToCountry.get(mergeKey);
      if (country) dedupedCountry.set(newKey, country);
    }
  }
  canonicalToOriginals.clear();
  for (const [k, v] of dedupedOriginals) canonicalToOriginals.set(k, v);
  canonicalToCountry.clear();
  for (const [k, v] of dedupedCountry) canonicalToCountry.set(k, v);

  // 3.6) 类型聚合
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

  // 3.6.1) 强制国家级聚合
  // 注意：已有 sqlPattern 的类型聚合条目（如 SECRETARIA_BR）不参与 FORCE_COUNTRY 合并。
  // 这些条目已有精确的 SQL LIKE 模式（如 "SECRETARIA %"），filter-builder 可直接使用，
  // 且保留了细粒度翻译名（如 "巴西各市厅局"）。强制合并会丢失这些翻译，
  // 将所有巴西/肯尼亚类型组压缩为单一的 "巴西各机构" / "肯尼亚各机构"。
  const FORCE_COUNTRY_COUNTRIES = new Set(["Brazil", "Kenya"]);
  const FORCE_COUNTRY_ZH: Record<string, string> = { "Brazil": "巴西", "Kenya": "肯尼亚" };
  const FORCE_COUNTRY_SQL: Record<string, string> = { "Brazil": "%", "Kenya": "%" };

  const forceCountryBuckets = new Map<string, AgencyCacheItem>();
  for (const [key, item] of typeAggregated) {
    // 已有 sqlPattern 的条目（来自 stage 3.6 类型聚合）保留独立性，不参与 FORCE_COUNTRY 合并
    if (item.sqlPattern) continue;
    let forceCountry: string | null = null;
    if (key.endsWith("_BR")) forceCountry = "Brazil";
    else if (key.endsWith("_KE")) forceCountry = "Kenya";
    if (!forceCountry) {
      const country = canonicalToCountry.get(key) || canonicalToCountry.get(key.toUpperCase());
      if (country && FORCE_COUNTRY_COUNTRIES.has(country)) forceCountry = country;
    }
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

  for (const [key] of typeAggregated) {
    // 已有 sqlPattern 的条目保留，不参与 FORCE_COUNTRY 删除判定
    const item = typeAggregated.get(key)!;
    if (item.sqlPattern) continue;
    let isForceCountry = false;
    if (key.endsWith("_BR") || key.endsWith("_KE")) isForceCountry = true;
    if (!isForceCountry) {
      const country = canonicalToCountry.get(key) || canonicalToCountry.get(key.toUpperCase());
      if (country && FORCE_COUNTRY_COUNTRIES.has(country)) isForceCountry = true;
    }
    if (!isForceCountry && item.originalAgencies?.length) {
      for (const orig of item.originalAgencies) {
        const c = canonicalToCountry.get(orig.toUpperCase());
        if (c && FORCE_COUNTRY_COUNTRIES.has(c)) { isForceCountry = true; break; }
      }
    }
    if (isForceCountry) typeAggregated.delete(key);
  }
  for (const [key, item] of forceCountryBuckets) {
    typeAggregated.set(key, item);
  }

  // 3.7) 兜底聚合
  const AGENCY_MIN_COUNT = 5;
  const finalAggregated = new Map<string, AgencyCacheItem>();
  const orphanByCountry = new Map<string, AgencyCacheItem>();

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
      country = extractCountryFromTypeKey(key) || "";
    }
    if (!country && item.originalAgencies?.length) {
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

  // 3.8) 汉化补全
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
        } else if (/\b(DE|DA|DO|DOS|DAS|LA|EL|LES|DES|DU|ET|AL|Y|E)\b/i.test(agencyName)) {
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
        } else {
          item.i18n = { ...item.i18n, zh: "政府机构" };
        }
      }
    }
  }

  // 4) 按合并后计数降序排列
  const data = Array.from(finalAggregated.values())
    .sort((a, b) => b.count - a.count);
  setAgencyCacheData(data);
  return data;
}
