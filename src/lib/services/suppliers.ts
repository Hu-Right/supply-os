/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Supplier } from "../types/supplier";
import { maskPhone, maskEmail, splitListField } from "../utils/mask";
import { getCountryDisplayName, getCountryEnglishName } from "../data/countryNames";

// ── supplier_merged 行 → 前端 Supplier DTO 映射与联系方式脱敏 ──
// 把「当前请求语言的译文」填进 *En 槽位：前端 pickLocale 对非 zh 语言取第二槽，组件零改动
export function mapSupplierRow(row: any, tr: any | null): Supplier {
  const industryZh =
    String(row.industry || "").trim() || splitListField(row.products)[0] || "其他";
  const productsZh = splitListField(row.products);
  const industryTr = String(tr?.industry_tr || "").trim() || industryZh;
  const productsTr = tr?.main_products_tr ? splitListField(tr.main_products_tr) : productsZh;
  const cityZh = String(row.city || "").trim() || String(row.province || "").trim() || "—";
  const companyName = String(row.company || "").trim();
  // supplier_merged.type 存经营类型（Manufacturer 等），国内/国际改由 country_code 判定（与目录筛选一致）
  const isInternational = Boolean(row.country_code) && row.country_code !== "CN";
  const countryRaw = String(row.country || "").trim();
  return {
    id: `sup-db-${row.id}`,
    nameZh: companyName,
    nameEn: companyName, // 公司名保留真实原文，不翻译
    type: isInternational ? "international" : "domestic",
    industryZh,
    industryEn: industryTr,
    // supplier_merged.country 存英文名，中文环境经 getCountryDisplayName 转中文展示
    countryZh: getCountryDisplayName(countryRaw || "China", "zh"),
    countryEn: getCountryEnglishName(countryRaw) || "China",
    cityZh,
    cityEn: cityZh,
    ungmCode: undefined,
    mainProductsZh: productsZh,
    mainProductsEn: productsTr,
    complianceLabelsZh: [],
    complianceLabelsEn: [],
    contactPerson: row.contact || "",
    contactEmail: maskEmail(row.email),
    contactPhone: maskPhone(row.phone),
    status: "approved",
  };
}

