/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Supplier } from "../../src/types";
import { maskPhone, maskEmail, splitListField } from "../utils/mask";

// ── crm_suppliers 行 → 前端 Supplier DTO 映射与联系方式脱敏 ──
// 把「当前请求语言的译文」填进 *En 槽位：前端 pickLocale 对非 zh 语言取第二槽，组件零改动
export function mapSupplierRow(row: any, tr: any | null): Supplier {
  const industryZh =
    String(row.industry || "").trim() || splitListField(row.main_product)[0] || "其他";
  const productsZh = splitListField(row.main_product);
  const complianceZh = splitListField(row.certification);
  const industryTr = String(tr?.industry_tr || "").trim() || industryZh;
  const productsTr = tr?.main_products_tr ? splitListField(tr.main_products_tr) : productsZh;
  const complianceTr = tr?.certification_tr ? splitListField(tr.certification_tr) : complianceZh;
  return {
    id: `sup-db-${row.id}`,
    nameZh: row.company_name,
    nameEn: row.company_name, // 公司名保留真实原文，不翻译
    type: "domestic",
    industryZh,
    industryEn: industryTr,
    countryZh: "中国",
    countryEn: "China",
    cityZh: "—",
    cityEn: "—",
    ungmCode: undefined,
    mainProductsZh: productsZh,
    mainProductsEn: productsTr,
    complianceLabelsZh: complianceZh,
    complianceLabelsEn: complianceTr,
    contactPerson: row.contact_name || "",
    contactEmail: maskEmail(row.email),
    contactPhone: maskPhone(row.telephone),
    status: "approved",
  };
}

