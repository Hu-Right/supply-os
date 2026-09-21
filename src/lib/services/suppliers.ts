/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Supplier } from "../types/supplier";
import { maskPhone, maskEmail, splitListField } from "../utils/mask";
import { getCountryDisplayName, getCountryEnglishName } from "../data/countryNames";

// ── 资料完整度 ─
// 统一口径：直接取 supplier.data_quality_score（DB 生成列，20 字段非空各计 5 分），
// 与后台管理端展示完全一致；此前应用层 12 字段加权算法已废弃删除。

/** DB decimal 列读出可能是字符串，统一转 0-100 数值 */
function readQualityScore(row: any): number {
  const n = Number(row?.data_quality_score);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0;
}

//  supplier 行 → 前端 Supplier DTO 映射与联系方式脱敏 ──
export function mapSupplierRow(row: any): Supplier {
  const industryZh =
    String(row.industry || "").trim() || splitListField(row.products)[0] || "其他";
  const productsZh = splitListField(row.products);
  const cityZh = String(row.city || "").trim() || String(row.province || "").trim() || "—";
  const companyName = String(row.company || "").trim();
  // supplier.type 存经营类型（如 foreign），国内/国际改由 country_code 判定（与目录筛选一致）
  const isInternational = Boolean(row.country_code) && row.country_code !== "CN";
  const countryRaw = String(row.country || "").trim();
  return {
    id: `sup-db-${row.id}`,
    nameZh: companyName,
    nameEn: companyName, // 公司名保留真实原文，不翻译
    type: isInternational ? "international" : "domestic",
    industryZh,
    industryEn: industryZh,
    // supplier.country 存英文名，中文环境经 getCountryDisplayName 转中文展示
    countryZh: getCountryDisplayName(countryRaw || "China", "zh"),
    countryEn: getCountryEnglishName(countryRaw) || "China",
    cityZh,
    cityEn: cityZh,
    ungmCode: undefined,
    mainProductsZh: productsZh,
    mainProductsEn: productsZh,
    complianceLabelsZh: row.certification ? splitListField(row.certification) : [],
    complianceLabelsEn: row.certification ? splitListField(row.certification) : [],
    contactPerson: row.contact || "",
    contactEmail: maskEmail(row.email),
    contactPhone: maskPhone(row.phone),
    status: "approved",
    dataCompleteness: readQualityScore(row),
  };
}

