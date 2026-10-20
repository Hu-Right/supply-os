/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Supplier } from "../types/supplier";
import type { SupplierDirectoryRow } from "../repos/suppliers";
import type { SupplierIndustryInfo } from "./industry-labels";
import { maskPhone, maskEmail, splitListField } from "../utils/mask";
import { primaryCountryOf } from "./country/resolve";
import type { CountryAliasSnapshot } from "./country/alias-store";

// ── 资料完整度 ─
// 统一口径：直接取 supplier.data_quality_score（DB 生成列，20 字段非空各计 5 分），
// 与后台管理端展示完全一致；此前应用层 12 字段加权算法已废弃删除。

/** DB decimal 列读出可能是字符串，统一转 0-100 数值 */
function readQualityScore(row: SupplierDirectoryRow): number {
  const n = Number(row?.data_quality_score);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0;
}

/** business_type_code → 卡片类型徽章：仅 manufacturer/trader 有真实标签，其余留白（宁缺毋滥，不再用国内外猜测兜底） */
const COMPANY_TYPE_BY_CODE: Partial<Record<string, "factory" | "trader">> = {
  manufacturer: "factory",
  trader: "trader",
};

/**
 *  supplier 行 → 前端 Supplier DTO 映射与联系方式脱敏
 *
 * @param industry 行业面视图（lib/services/industry-labels 批量装配）。给了且能解析到节点
 *                 就把行业展示从「自填文本」升级为「权威树标签 + 双语名」；不给/解析不到
 *                 则回落到主营产品首项（industry 自由文本列已于 2026-10-15 退役）。
 */
export function mapSupplierRow(
  row: SupplierDirectoryRow,
  industry?: SupplierIndustryInfo | null,
  snap?: CountryAliasSnapshot,
): Supplier {
  const industryText = splitListField(row.products)[0] || "其他";
  const standard = industry?.primary ?? null;
  // 有标准标签 → 中英文名各取一侧（英文是 ISIC 官方名）；无 → 两列同原文（旧行为）
  const industryZh = standard ? standard.nameZh : industryText;
  const industryEn = standard ? standard.nameEn : industryText;
  const productsZh = splitListField(row.products);
  const cityZh = String(row.city || "").trim() || String(row.province || "").trim() || "—";
  const companyName = String(row.company || "").trim();
  // supplier.business_type 存经营类型（如 foreign），国内/国际改由 country_code 判定（与目录筛选一致）
  const isInternational = Boolean(row.country_code) && row.country_code !== "CN";
  const countryRaw = String(row.country || "").trim();
  const countryKey = countryRaw || "China";
  // 国家展示走表（crm_country_aliases）：命中取 name_i18n.zh + canonical，未命中回原值（无静态字典兼底）。
  const centry = snap ? primaryCountryOf(countryKey, snap) : undefined;
  return {
    id: `sup-db-${row.id}`,
    nameZh: companyName,
    nameEn: companyName, // 公司名保留真实原文，不翻译
    type: isInternational ? "international" : "domestic",
    industryZh,
    industryEn,
    industryCode: standard?.code,
    industryText,
    industryPathZh: standard ? industry?.pathZh : undefined,
    industryPathEn: standard ? industry?.pathEn : undefined,
    industryTags: standard ? industry?.tags : undefined,
    // supplier.country 展示统一走表解析（与归一同一入口）
    countryZh: centry?.zh || centry?.canonical || countryKey,
    countryEn: centry?.canonical || countryKey,
    cityZh,
    cityEn: cityZh,
    mainProductsZh: productsZh,
    mainProductsEn: productsZh,
    complianceLabelsZh: row.certification ? splitListField(row.certification) : [],
    complianceLabelsEn: row.certification ? splitListField(row.certification) : [],
    companyType: COMPANY_TYPE_BY_CODE[row.business_type_code ?? ""],
    contactPerson: row.contact || "",
    contactEmail: maskEmail(row.email),
    contactPhone: maskPhone(row.phone),
    status: "approved",
    dataCompleteness: readQualityScore(row),
  };
}

