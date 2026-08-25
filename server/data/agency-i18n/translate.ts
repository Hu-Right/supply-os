/**
 * 按模式匹配生成机构翻译
 * Pattern-based Agency Name Translation
 *
 * @module server/data/agency-i18n/translate
 * @description 优先级：精确缩写 > 巴西前缀 > 巴西扩展 > 肯尼亚 > 国际 > 连字符递归 > 关键词兜底
 */
import type { PatternI18nResult } from "./types";
import { KNOWN_ACRONYMS } from "./known-acronyms";
import { BR_PREFIX_MAP, BR_EXTRA_PREFIX_MAP, KENYA_PREFIX_MAP, INTL_PREFIX_MAP } from "./prefix-patterns";

/**
 * 按模式匹配生成机构翻译
 * @param agencyName 原始机构名
 * @returns 翻译结果，未匹配返回 null
 */
export function translateByPattern(agencyName: string): PatternI18nResult | null {
  const trimmed = agencyName.trim();
  if (!trimmed) return null;

  // 按优先级尝试：精确缩写 > 巴西 > 肯尼亚 > 国际
  const upper = trimmed.toUpperCase();
  const exactMatch = KNOWN_ACRONYMS.get(upper);
  if (exactMatch) return exactMatch;

  const allMaps = [BR_PREFIX_MAP, BR_EXTRA_PREFIX_MAP, KENYA_PREFIX_MAP, INTL_PREFIX_MAP];
  for (const map of allMaps) {
    for (const [regex, fn] of map) {
      const match = trimmed.match(regex);
      if (match) {
        const rest = match[1]?.trim();
        if (rest) return fn(rest);
      }
    }
  }

  // 连字符前缀递归模式（从 BR_EXTRA_PREFIX_MAP 分离，避免循环依赖）
  // PMSP - COMPANHIA, FMDE-FUNDO, SANEBAVI - SANEAMENTO
  const hyphenMatch = trimmed.match(/^[A-Z]+\s*[-–—]\s*(.+)/i);
  if (hyphenMatch) {
    const rest = hyphenMatch[1]?.trim();
    if (rest) {
      const inner = translateByPattern(rest);
      if (inner) return inner;
      return { canonical: rest, i18n: { zh: rest, fr: rest, ru: rest, es: rest, ar: rest } };
    }
  }

  // 通用兜底：对任何未匹配的机构名
  if (trimmed.length > 0) {
    const isEnglish = /[a-zA-Z]/.test(trimmed);
    if (isEnglish) {
      const TYPE_KEYWORDS: Array<[RegExp, string]> = [
        [/\bCOMMITTEE\b/i, "委员会"], [/\bCOMMISSION\b/i, "委员会"],
        [/\bBOARD\b/i, "理事会"], [/\bCOUNCIL\b/i, "议会"],
        [/\bTRIBUNAL\b/i, "法庭"], [/\bMINISTRY\b/i, "部"],
        [/\bDEPARTMENT\b/i, "部门"], [/\bAUTHORITY\b/i, "管理局"],
        [/\bAGENCY\b/i, "机构"], [/\bBUREAU\b/i, "局"],
        [/\bOFFICE\b/i, "办公室"], [/\bDIVISION\b/i, "司"],
        [/\bUNIVERSITY\b/i, "大学"], [/\bCOLLEGE\b/i, "学院"],
        [/\bINSTITUTE\b/i, "研究所"], [/\bINSTITUTION\b/i, "机构"],
        [/\bHOSPITAL\b/i, "医院"], [/\bFOUNDATION\b/i, "基金会"],
        [/\bFUND\b/i, "基金"], [/\bTRUST\b/i, "信托"],
        [/\bASSOCIATION\b/i, "协会"], [/\bFEDERATION\b/i, "联合会"],
        [/\bUNION\b/i, "联盟"], [/\bSOCIETY\b/i, "学会"],
        [/\bCOOPERATIVE\b/i, "合作社"], [/\bCORPORATION\b/i, "公司"],
        [/\bCOMPANY\b/i, "公司"], [/\bBANK\b/i, "银行"],
        [/\bCENTER\b/i, "中心"], [/\bCENTRE\b/i, "中心"],
        [/\bCOURT\b/i, "法院"], [/\bPARLIAMENT\b/i, "议会"],
        [/\bCONGRESS\b/i, "国会"], [/\bEMBASSY\b/i, "大使馆"],
        [/\bCONSULATE\b/i, "领事馆"], [/\bPROGRAMME\b/i, "项目"],
        [/\bPROGRAM\b/i, "项目"], [/\bNETWORK\b/i, "网络"],
      ];
      for (const [regex, typeZh] of TYPE_KEYWORDS) {
        if (regex.test(trimmed)) {
          const namePart = trimmed.replace(regex, "").trim().replace(/\s+/g, " ");
          if (namePart) return { canonical: trimmed, i18n: { zh: `${namePart}${typeZh}`, fr: trimmed, ru: trimmed, es: trimmed, ar: trimmed } };
          else return { canonical: trimmed, i18n: { zh: typeZh, fr: trimmed, ru: trimmed, es: trimmed, ar: trimmed } };
        }
      }
      return { canonical: trimmed, i18n: { zh: trimmed, fr: trimmed, ru: trimmed, es: trimmed, ar: trimmed } };
    } else {
      return { canonical: trimmed, i18n: { zh: trimmed, fr: trimmed, ru: trimmed, es: trimmed, ar: trimmed } };
    }
  }

  return null;
}
