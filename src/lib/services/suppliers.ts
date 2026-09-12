/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Supplier } from "../types/supplier";
import { maskPhone, maskEmail, splitListField } from "../utils/mask";
import { getCountryDisplayName, getCountryEnglishName } from "../data/countryNames";

// ── 资料完整度计算 ─
// 根据供应商档案各字段填写情况，加权计算 0-100 百分比
const COMPLETENESS_FIELDS: { key: keyof ReturnType<typeof buildSupplierFields>; weight: number }[] = [
  { key: "companyName", weight: 15 },       // 公司名（核心）
  { key: "industry", weight: 10 },          // 行业
  { key: "country", weight: 8 },            // 国家
  { key: "city", weight: 5 },               // 城市
  { key: "products", weight: 15 },          // 主营产品
  { key: "certification", weight: 12 },     // 认证资质
  { key: "contactPerson", weight: 8 },      // 联系人
  { key: "email", weight: 7 },              // 邮箱
  { key: "phone", weight: 5 },              // 电话
  { key: "imageUrl", weight: 5 },           // 公司图片
  { key: "unspscCode", weight: 5 },         // UNSPSC 编码
  { key: "companyType", weight: 5 },        // 企业类型
];

function buildSupplierFields(row: any) {
  return {
    companyName: String(row.company || "").trim(),
    industry: String(row.industry || "").trim(),
    country: String(row.country || "").trim(),
    city: String(row.city || row.province || "").trim(),
    products: String(row.products || "").trim(),
    certification: String(row.certification || "").trim(),
    contactPerson: String(row.contact || "").trim(),
    email: String(row.email || "").trim(),
    phone: String(row.phone || "").trim(),
    imageUrl: String(row.image_url || row.imageUrl || "").trim(),
    unspscCode: String(row.unspsc_code || row.unspscCode || "").trim(),
    companyType: String(row.company_type || row.companyType || "").trim(),
  };
}

function calculateDataCompleteness(row: any): number {
  const fields = buildSupplierFields(row);
  let score = 0;
  for (const { key, weight } of COMPLETENESS_FIELDS) {
    const val = fields[key];
    if (val && val.length > 0) score += weight;
  }
  return Math.min(score, 100);
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
    dataCompleteness: calculateDataCompleteness(row),
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

