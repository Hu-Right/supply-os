/**
 * F01 主体核验辅助：采购方编号、自动查重、风险提示
 * @module lib/services/procurement/buyer-compliance
 *
 * @description 对应全案 F01「系统操作逻辑」：
 *              ① 审核通过生成唯一采购方编号 BUYER-ID（`BUY-{年}-{6位id}`，展示用，不改主键）；
 *              ② 自动查重：企业名称 / 注册号 / 邮箱 / 电话任一相同即提示（不自动拒绝，交审核员判断）；
 *              ③ AI 前置的风险提示由可解释规则产生（免费邮箱、缺执照、代理无授权文件、外部规则），
 *                 供采购方自检与审核后台参考——不替代人工核验。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { BuyerRow } from "./buyers";

const FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "qq.com",
  "163.com",
  "126.com",
  "sina.com",
  "foxmail.com",
];

export function formatBuyerNo(buyerId: number, at: number = Math.floor(Date.now() / 1000)): string {
  const year = new Date(at * 1000).getUTCFullYear();
  return `BUY-${year}-${String(buyerId).padStart(6, "0")}`;
}

export interface BuyerDuplicate {
  buyerId: number;
  orgName: string;
  matchedField: "org_name" | "reg_no" | "official_email" | "official_phone";
}

/** 自动查重：四字段任一相同即命中（排除自身） */
export async function findBuyerDuplicates(
  db: Pool,
  input: { buyerId: number; orgName: string; regNo: string | null; email: string | null; phone: string | null },
): Promise<BuyerDuplicate[]> {
  const orgName = input.orgName.trim();
  if (!orgName && !input.regNo && !input.email && !input.phone) return [];
  const [rows] = await db.query(
    `SELECT id, org_name, reg_no, official_email, official_phone
       FROM procurement_buyers
      WHERE id <> ?
        AND (org_name = ? OR (? <> '' AND reg_no = ?) OR (? <> '' AND official_email = ?) OR (? <> '' AND official_phone = ?))
      LIMIT 5`,
    [
      input.buyerId,
      orgName,
      input.regNo ?? "",
      input.regNo ?? "",
      input.email ?? "",
      input.email ?? "",
      input.phone ?? "",
      input.phone ?? "",
    ],
  );
  return (rows as RowDataPacket[]).map((r) => {
    let matchedField: BuyerDuplicate["matchedField"] = "org_name";
    if (input.regNo && String(r.reg_no ?? "") === input.regNo) matchedField = "reg_no";
    else if (input.email && String(r.official_email ?? "") === input.email) matchedField = "official_email";
    else if (input.phone && String(r.official_phone ?? "") === input.phone) matchedField = "official_phone";
    return { buyerId: Number(r.id), orgName: String(r.org_name ?? ""), matchedField };
  });
}

/**
 * 风险提示（规则版，可解释）：返回 code 列表，前端映射文案。
 * 只提示、不阻断——真实性结论仍由云境核验员作出。
 */
export function buyerRiskFlags(buyer: BuyerRow): string[] {
  const flags: string[] = [];
  if (!buyer.license_file_key) flags.push("missing_license");
  if (!buyer.reg_no) flags.push("missing_reg_no");
  const email = String(buyer.official_email ?? "").toLowerCase();
  if (email) {
    const domain = email.split("@")[1] ?? "";
    if (FREE_EMAIL_DOMAINS.includes(domain)) flags.push("free_email");
    // 企业邮箱与主体信息一致性：邮箱域名应与官网域名一致（任一方包含另一方视为一致）
    const site = String(buyer.website ?? "").trim();
    if (domain && site) {
      let host: string;
      try {
        host = new URL(site.includes("://") ? site : `https://${site}`).hostname.toLowerCase().replace(/^www\./, "");
      } catch {
        host = "";
      }
      if (host && !domain.endsWith(host) && !host.endsWith(domain)) flags.push("email_domain_mismatch");
    }
  } else {
    flags.push("missing_email");
  }
  if (buyer.buyer_role === "authorized_agent" && !buyer.agent_auth_file_key) flags.push("agent_auth_missing");
  if (buyer.external_rules && String(buyer.external_rules).trim()) flags.push("external_rules");
  if (!buyer.auth_contact_name) flags.push("auth_contact_missing");
  return flags;
}
