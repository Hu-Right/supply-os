/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Supplier } from "../types/supplier";
import { maskPhone, maskEmail, splitListField } from "../utils/mask";
import { getCountryDisplayName, getCountryEnglishName } from "../data/countryNames";

// ─ supplier 行 → 前端 Supplier DTO 映射与联系方式脱敏 ──
// 把「当前请求语言的译文」填进 *En 槽位：前端 pickLocale 对非 zh 语言取第二槽，组件零改动
export function mapSupplierRow(row: any, tr: any | null): Supplier {
  const industryZh =
    String(row.industry || "").trim() || splitListField(row.products)[0] || "其他";
  const productsZh = splitListField(row.products);
  const industryTr = String(tr?.industry_tr || "").trim() || industryZh;
  const productsTr = tr?.main_products_tr ? splitListField(tr.main_products_tr) : productsZh;
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
    industryEn: industryTr,
    // supplier.country 存英文名，中文环境经 getCountryDisplayName 转中文展示
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

// ─ 供应商入驻注册编排（架构评估 A4：自 suppliers POST 路由下沉） ──
import crypto from "crypto";
import type { SupplierRegistrationRepo } from "../repos/suppliers";
import { RouteError } from "../middleware/route-handler";

export interface CrmSupplierRegistrationInput {
  nameZh?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  mainProductsZh?: string[];
  industryZh?: string;
  complianceLabelsZh?: string[];
}

/**
 * 外部 CRM 供应商入驻注册：防重哈希 → 查重 → 插入 → 回读。
 * 命中 24h 防重窗口抛 RouteError(409/40019)；插入失败抛 RouteError(500/50000)。
 * 防重哈希：sha256 截断 32 位十六进制（128 位），与外部 CRM crm_suppliers.request_hash
 * 的既有列宽（32）兼容；防重窗口 24h，非对抗性场景，截断不构成安全弱化。
 */
export async function registerCrmSupplier(
  registrationRepo: SupplierRegistrationRepo,
  input: CrmSupplierRegistrationInput,
): Promise<Record<string, unknown>> {
  const hashPayload = JSON.stringify({
    name: input.nameZh,
    contact: input.contactPerson,
    email: input.contactEmail,
  });
  const requestHash = crypto
    .createHash("sha256")
    .update(hashPayload)
    .digest("hex")
    .slice(0, 32);

  // 防重：同哈希 24h 内不重复提交
  const existing = await registrationRepo.findCrmByRequestHash(requestHash);
  if (existing) {
    throw new RouteError(409, 40019, "该公司已注册或近期已提交过");
  }

  try {
    const id = await registrationRepo.insertCrmSupplier({
      companyName: input.nameZh || "",
      contactName: input.contactPerson || "",
      telephone: input.contactPhone || "",
      email: input.contactEmail || "",
      mainProduct: Array.isArray(input.mainProductsZh) ? input.mainProductsZh.join(", ") : "",
      industry: input.industryZh || "",
      certification: Array.isArray(input.complianceLabelsZh) ? input.complianceLabelsZh.join(", ") : "",
      requestHash,
    });
    return (await registrationRepo.findCrmById(id)) || { id };
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.error("[suppliers POST]", err);
    throw new RouteError(500, 50000, "注册失败");
  }
}

