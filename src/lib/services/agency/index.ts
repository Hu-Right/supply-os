/**
 * 机构名模式化 i18n 翻译
 * Agency Name Pattern-based i18n Translation
 *
 * @module server/services/agencyI18n
 * @description 对未命中别名映射表的机构，按命名模式动态生成多语言翻译。
 *              覆盖巴西各级政府机构（占无翻译数据的 70%+）、肯尼亚政府、国际机构等。
 *              优先级：精确别名映射 > 模式翻译 > 英文原名（回退）。
 *
 *              数据层已分离至 agency-i18n-data.ts，本文件仅保留逻辑入口。
 */

export type { PatternI18nResult } from "../agency-i18n-data";
export { translateByPattern } from "../agency-i18n-data";

import {
  KNOWN_ACRONYMS,
  TYPE_PATTERNS,
  INTL_TYPE_PATTERNS,
  INTL_TYPE_EN,
} from "../agency-i18n-data";
import { countryZhOf } from "../country/display";
import { getAgencyTypeRules } from "./type-store";

/**
 * 判断机构是否应按类型聚合（支持按国家维度细分）
 * @param agencyName 机构名（已归一化后的 canonical）
 * @param country 机构所属国家英文名（可选，用于 INTL 模式国家级聚合）
 * @returns null 表示不聚合（保留独立条目），否则返回聚合类型信息
 */
export function classifyAgencyType(
  agencyName: string,
  country?: string,
): { typeKey: string; i18n: Record<string, string> } | null {
  const trimmed = agencyName.trim();
  if (!trimmed) return null;

  // 精确匹配的特定机构不聚合（如 UNDP、WHO、WTO 等）
  const upper = trimmed.toUpperCase();
  if (KNOWN_ACRONYMS.has(upper)) return null;

  const countryKey = (country ?? "").trim().toLowerCase();
  const matchesCountry = (typeKey: string): boolean => {
    if (!countryKey) return true; // 无国家上下文：保留历史默认行为
    if (typeKey.endsWith("_BR")) {
      return countryKey === "brazil" || countryKey === "brasil" || countryKey === "br";
    }
    if (typeKey.endsWith("_KE")) {
      return countryKey === "kenya" || countryKey === "ke";
    }
    return true;
  };

  const countryCode = countryKey === "brazil" || countryKey === "brasil" ? "BR"
    : countryKey === "kenya" ? "KE"
      : /^[a-z]{2}$/.test(countryKey) ? countryKey.toUpperCase() : "";
  const matchesRuleCountry = (ruleCountry: string | null): boolean => {
    if (!ruleCountry) return true;
    return !!countryCode && countryCode === ruleCountry.toUpperCase();
  };

  // 优先使用 crm_agency_type_rules；表未加载时回退代码内静态规则。
  const dbRules = getAgencyTypeRules();
  if (dbRules) {
    for (const rule of dbRules) {
      if (!matchesRuleCountry(rule.countryCode)) continue;
      if (rule.regex.test(trimmed)) {
        return { typeKey: rule.typeKey, i18n: rule.i18n };
      }
    }
    return null;
  }

  // 按模式匹配分类：先检查国家特定模式（巴西/肯尼亚）。
  // 必须校验国家，否则阿根廷的 “Departamento ...” 会被错误归到 DEPARTAMENTO_BR。
  for (const [regex, typeInfo] of TYPE_PATTERNS) {
    if (regex.test(trimmed) && matchesCountry(typeInfo.typeKey)) return typeInfo;
  }

  // 国际通用模式：如果知道国家，按国家+类型聚合（如「乌干达各委员会」）
  for (const [regex, typeInfo] of INTL_TYPE_PATTERNS) {
    if (regex.test(trimmed)) {
      if (country) {
        const countryZh = countryZhOf(country);
        if (countryZh) {
          // 有中文名 → 生成国家级聚合条目
          const enLabel = INTL_TYPE_EN[typeInfo.typeKey] || typeInfo.typeKey;
          return {
            typeKey: `${country} ${enLabel}`,
            i18n: {
              zh: `${countryZh}${typeInfo.i18n.zh}`,
              fr: `${typeInfo.i18n.fr} (${country})`,
              ru: `${typeInfo.i18n.ru} (${country})`,
              es: `${typeInfo.i18n.es} (${country})`,
              ar: `${typeInfo.i18n.ar} (${country})`,
            },
          };
        }
      }
      // 无国家或无中文名 → 回退到全球聚合
      return typeInfo;
    }
  }

  // 未匹配任何模式 → 不聚合
  return null;
}
