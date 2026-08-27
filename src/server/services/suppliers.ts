/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import "server-only";

import { Supplier } from "../types/supplier";
import { maskPhone, maskEmail, splitListField } from "../utils/mask";

// ── supplier 行 → 前端 Supplier DTO 映射与联系方式脱敏 ──
// 把「当前请求语言的译文」填进 *En 槽位：前端 pickLocale 对非 zh 语言取第二槽，组件零改动
export function mapSupplierRow(row: any, tr: any | null): Supplier {
  const industryZh =
    String(row.industry || "").trim() || splitListField(row.products)[0] || "其他";
  const productsZh = splitListField(row.products);
  const industryTr = String(tr?.industry_tr || "").trim() || industryZh;
  const productsTr = tr?.main_products_tr ? splitListField(tr.main_products_tr) : productsZh;
  const cityZh = String(row.city || "").trim() || String(row.province || "").trim() || "—";
  return {
    id: `sup-db-${row.id}`,
    nameZh: row.company,
    nameEn: row.company, // 公司名保留真实原文，不翻译
    type: row.type === "international" ? "international" : "domestic",
    industryZh,
    industryEn: industryTr,
    countryZh: String(row.country || "").trim() || "中国",
    countryEn: row.country_code === "CN" ? "China" : String(row.country || "").trim() || "China",
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

