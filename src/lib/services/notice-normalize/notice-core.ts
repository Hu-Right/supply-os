/**
 * 公告归一化核心：买家 / 国家 / 机构类型的唯一口径。
 *
 * 历史问题：宽表构建器（wide-row-builder）与对外服务表构建器（notice-public-v2）
 * 各自内联同族逻辑，已经漂移——占位平台名只有服务表剔除、国家码形制只有服务表校验、
 * _INTL 通用键折回两边各抄一份。后果是列表（宽表/Meili）与详情（服务表）对同一公告
 * 可能给出不同的买家、类型分组。收敛后两边都必须走这里；改口径只改本文件。
 *
 * 本模块产出语义值（不按列宽截断）；列宽截断与空值策略（NOT NULL 落空串 / 可空落 NULL）
 * 是各写入者自己的事。
 */
import { normalizeAliasKey } from "../agency/alias-store";
import { isAgencyPlaceholder } from "../agency/placeholder";
import { classifyAgencyType } from "../agency";
import { resolveCountries, countryCanonicalsOf, countryCodesOf } from "../country/resolve";
import type { CountryAliasSnapshot } from "../country/alias-store";

/**
 * 多国/区域项目保留码（2026-10-30 用户拍板）：源数据为跨国/区域采购
 * （"Multiple destinations"/"Eastern and Southern Africa"/"Regional"...）时，
 * 解析只命中 region 而无单一国家 → country_code 落 ZZ 保留码（ISO2 user-assigned 段，
 * 不与真实国家冲突），使其可筛选、可显示为「多国/区域」。前端显示名见
 * shared/data/countryNames.ts 的 ZZ 特判；ISO 语义的 countryCodes 数组不含 ZZ。
 */
export const MULTI_REGION_COUNTRY_CODE = "ZZ";

/** 买家/国家归一产物 */
export interface BuyerCountryCore {
  /** 采购主体规范名：别名表命中取 canonical，占位平台名剔除后为 null（不可对外展示） */
  buyerName: string | null;
  /** 机构类型通用键（_INTL 国家级键已折回）；宽表与服务表的 buyer_group 同名同值（Meili 属性名仍为 agency_group） */
  buyerGroup: string | null;
  /** 主国家英文标准名（表驱动解析，无快照/未命中为 null） */
  countryName: string | null;
  /** 主国家 ISO2 码（第一个通过形制校验的） */
  countryCode: string | null;
  /** 全部国家 ISO2 码集（已按 /^[A-Z]{2}$/ 校验、去重、保序） */
  countryCodes: string[];
}

/**
 * classifyAgencyType 的唯一调用口径：对 _INTL 后缀的国家级聚合键，
 * 用无国家参数重分类折回通用键，保证宽表/服务表落库键与内存缓存（agencies/query）
 * 及 Meilisearch filter 三处一致。
 */
export function classifyBuyerGroup(buyerName: string, countryName: string): string | null {
  const typeInfo = classifyAgencyType(buyerName, countryName);
  if (!typeInfo) return null;
  if (typeInfo.typeKey.endsWith("_INTL")) {
    const generic = classifyAgencyType(buyerName);
    if (generic) return generic.typeKey;
  }
  return typeInfo.typeKey;
}

/**
 * 买家 + 国家 + 机构类型的一次性归一。
 * @param agencyAliases alias（归一大写键）→ canonical；来源 agency/alias-store 快照
 */
export function normalizeBuyerCountry(
  input: { agency?: unknown; agencyFull?: unknown; organization?: unknown; country?: unknown },
  agencyAliases: Map<string, string>,
  countrySnap?: CountryAliasSnapshot,
): BuyerCountryCore {
  // 采购主体以 agency_full 为准（缺失才回退 agency）：很多源的 agency 实为发布平台码，
  // agency_full 才是真实采购单位；下游 std/卡片/详情/筛选统一按真买家。
  const agencyRaw = String(input.agencyFull ?? "").trim() || String(input.agency ?? "").trim();
  let candidate = agencyRaw ? agencyAliases.get(normalizeAliasKey(agencyRaw)) || agencyRaw : "";
  // 部分源把平台码写进 agency，真实采购单位在 organization（常为 A||B||C 的层级串）：
  // 平台占位名不可对外，回退 organization 的首段，而不是直接落 NULL。
  if (!candidate || isAgencyPlaceholder(candidate)) {
    const orgRaw = String(input.organization ?? "").split("||")[0].trim();
    if (orgRaw) candidate = agencyAliases.get(normalizeAliasKey(orgRaw)) || orgRaw;
  }
  const buyerName = candidate && !isAgencyPlaceholder(candidate) ? candidate : null;

  const cRes = countrySnap ? resolveCountries(String(input.country ?? ""), countrySnap) : null;
  const countryName = cRes ? countryCanonicalsOf(cRes)[0] || null : null;
  const countryCodes = cRes ? [...new Set(countryCodesOf(cRes))].filter((c) => /^[A-Z]{2}$/.test(c)) : [];
  // 无单一国家但命中区域（kind=region）→ 多国/区域保留码；两者皆无 → null（真缺表，待补）
  const countryCode = countryCodes[0]
    ?? (cRes && cRes.refs.some((r) => r.kind === "region") ? MULTI_REGION_COUNTRY_CODE : null);

  const buyerGroup = buyerName && countryName ? classifyBuyerGroup(buyerName, countryName) : null;
  return { buyerName, buyerGroup, countryName, countryCode, countryCodes };
}
