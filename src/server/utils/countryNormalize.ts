/**
 * 国家名归一化共享函数
 * Shared country name normalization function
 *
 * @module server/utils/countryNormalize
 * @description 将数据库中各种国家名变体（"Brasil"、"Brazil"、"巴西"、"RUS" 等）
 *              统一归一化为标准英文名（"Brazil"、"Russia" 等）。
 *              三处调用方（宽表同步、国家下拉列表、Meilisearch 索引）共用同一函数，
 *              确保归一化结果完全一致。
 *
 *              归一化规则（按优先级）：
 *              1. cleanCountryRaw 预处理（剥离脏数据前缀）
 *              2. 斜杠分隔符拆分（"Myanmar/Burma" → 取 "Myanmar"）
 *              3. COUNTRY_NAME_ZH 精确匹配
 *              4. 大写不敏感匹配
 *              5. 子国家/地区 → 所属国家（"Colombo" → "Sri Lanka"）
 *              6. 逗号拆分（"Canada, British Columbia" → "Canada"）
 *              7. 未知 → 原样返回
 */
import "server-only";
import {
  COUNTRY_NAME_ZH,
  SUB_COUNTRY_ZH,
  cleanCountryRaw,
} from "../../lib/data/countryNames";

// ── 大写英文名 → 标准英文名（原始大小写）──
export const UPPER_TO_CANONICAL = new Map<string, string>();

// ── 子国家大写映射（大小写不敏感兜底）──
const UPPER_SUB_COUNTRY = new Map<string, string>();

// ── 中文国家名 → 英文标准名反向查找 ──
export const ZH_TO_CANONICAL_EN = new Map<string, string>();

// ── 模块初始化：构建所有映射表 ──
{
  // Step 1: 按中文名分组，收集所有英文名变体
  const zhGroups = new Map<string, string[]>();
  for (const [en, zh] of Object.entries(COUNTRY_NAME_ZH)) {
    if (!zhGroups.has(zh)) zhGroups.set(zh, []);
    zhGroups.get(zh)!.push(en);
  }

  // Step 2: 为每组选择标准名（canonical），建立大写 → canonical 映射
  for (const [zh, forms] of zhGroups) {
    // 跳过区域分组（"东部和南部非洲"等），这些不是真实国家
    // 注意："多国" 已从跳过列表中移除，因为 Latin America 等区域名需要归一化为 Multi-Country
    if (["东部和南部非洲", "西部和中部非洲", "西南印度洋", "区域"].includes(zh)) continue;

    // 选择 canonical：使用含小写字母的形式（排除纯缩写如 PHL/USA/IND）
    const canonical = forms.find((f) => /[a-z]/.test(f)) || forms[0];

    for (const form of forms) {
      UPPER_TO_CANONICAL.set(form.toUpperCase(), canonical);
    }
    UPPER_TO_CANONICAL.set(canonical.toUpperCase(), canonical);

    // 建立中文名 → 英文标准名反向映射
    if (/^[\u4e00-\u9fff]/.test(canonical)) {
      // canonical 本身是中文（如 "英国"），用第一个含大写字母的形式
      const enForm = forms.find((f) => /^[A-Z]/.test(f) && !/^[A-Z]{2,}$/.test(f));
      if (enForm) ZH_TO_CANONICAL_EN.set(zh, enForm);
    } else {
      ZH_TO_CANONICAL_EN.set(zh, canonical);
    }
  }

  // Step 3: 子国家大写映射
  for (const [region, zh] of Object.entries(SUB_COUNTRY_ZH)) {
    UPPER_SUB_COUNTRY.set(region.toUpperCase(), zh);
  }
}

/**
 * 将数据库中的国家名归一化为标准英文名
 *
 * @param raw 原始国家名（可能是英文、中文、缩写、子国家名等）
 * @returns 标准英文名（如 "Brazil"、"Russia"）；无法识别则原样返回
 *
 * @example
 * normalizeCountry("Brasil")        // → "Brazil"
 * normalizeCountry("RUS")           // → "Russia"
 * normalizeCountry("Colombo")       // → "Sri Lanka"（子国家归并）
 * normalizeCountry("Canada, BC")    // → "Canada"（逗号拆分）
 * normalizeCountry("Myanmar/Burma") // → "Myanmar"（斜杠拆分）
 */
export function normalizeCountry(raw: string): string {
  const trimmed = cleanCountryRaw(raw);
  if (!trimmed) return trimmed;

  // 0. 数据质量问题：非国家名被写入 country 字段，直接返回 Unknown
  const INVALID_COUNTRY_VALUES = new Set([
    "consultancy services", "consulting", "services", "service",
    "consultant", "consultants", "agency", "organization",
  ]);
  if (INVALID_COUNTRY_VALUES.has(trimmed.toLowerCase())) return "Unknown";

  // 0.5 斜杠分隔符：尝试每个部分（处理 "Myanmar/Burma" 等）
  if (trimmed.includes("/")) {
    const slashParts = trimmed.split("/").map(p => p.trim()).filter(Boolean);
    for (const part of slashParts) {
      if (COUNTRY_NAME_ZH[part]) return UPPER_TO_CANONICAL.get(part.toUpperCase()) || part;
      const sp = UPPER_TO_CANONICAL.get(part.toUpperCase());
      if (sp) return sp;
    }
  }

  // 1. 精确匹配（保留原始大小写）
  if (COUNTRY_NAME_ZH[trimmed]) return UPPER_TO_CANONICAL.get(trimmed.toUpperCase()) || trimmed;

  // 2. 大写匹配（覆盖数据库中的各种大小写变体）
  const canonical = UPPER_TO_CANONICAL.get(trimmed.toUpperCase());
  if (canonical) return canonical;

  // 2.5 子国家/地区 → 所属国家英文标准名
  const subZh = SUB_COUNTRY_ZH[trimmed] || UPPER_SUB_COUNTRY.get(trimmed.toUpperCase());
  if (subZh) {
    return ZH_TO_CANONICAL_EN.get(subZh) || subZh;
  }

  // 3. 含逗号时拆分，提取国家名（处理 "Canada, British Columbia" 和 "British Columbia, Canada" 两种格式）
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      // 3a. 首部分作为国家（"Canada, British Columbia"）
      const firstPart = parts[0];
      if (COUNTRY_NAME_ZH[firstPart]) return UPPER_TO_CANONICAL.get(firstPart.toUpperCase()) || firstPart;
      const firstCanonical = UPPER_TO_CANONICAL.get(firstPart.toUpperCase());
      if (firstCanonical) return firstCanonical;
      // 子国家匹配
      const firstSubZh = SUB_COUNTRY_ZH[firstPart] || UPPER_SUB_COUNTRY.get(firstPart.toUpperCase());
      if (firstSubZh) return ZH_TO_CANONICAL_EN.get(firstSubZh) || firstSubZh;

      // 3b. 末部分作为国家（"British Columbia, Canada"）
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1];
        if (COUNTRY_NAME_ZH[lastPart]) return UPPER_TO_CANONICAL.get(lastPart.toUpperCase()) || lastPart;
        const lastCanonical = UPPER_TO_CANONICAL.get(lastPart.toUpperCase());
        if (lastCanonical) return lastCanonical;
      }
    }
  }

  // 4. 未知国家名，保持原样
  return trimmed;
}
