/**
 * AI 下游共用的供应商画像取数（唯一出口）
 * Shared supplier-profile fetcher for AI downstream services
 *
 * @module lib/services/ai/shared/supplier-profile
 * @description ai-summary 与 ai-score 原先各抄一份几乎相同的 JOIN，且都挂在**已作废的
 *              crm_supplier_qualification** 上。诊断表切到 v2 后合并为一份，并且：
 *              1) 走 `crm_supplier_diagnosis`，按 (user_id, supplier_id) 唯一键命中，
 *                 不再用 `ORDER BY q.id DESC LIMIT 1` 猜最新一条；
 *              2) **不再把 v2 字段伪装成 v1 键名**（早期为省事把 team_discipline 别名成
 *                 employee_count、把英文两题拼成 english_team，结果 prompt 里"员工规模"
 *                 拿到的其实是投标团队台账 —— 语义错位比缺字段更难查）；
 *              3) 诊断列清单由 `shared/constants/diagnosis-dimensions` 的 SSOT 派生，
 *                 与资源库候选画像共用，保证“我自己”与“候选工厂”喂给模型的字段完全同口径。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { DIAGNOSIS_COLUMNS, diagnosisColumnSelect } from "@/shared/constants/diagnosis-dimensions";

/** 全字段均为字符串（NULL 归一为空串），故继承 Record<string, string>：
 *  prompt 模板与 ai-match 均按扁平字典接形，无需在调用点做双重强转。 */
export interface SupplierProfileForAi extends Record<string, string> {
  company: string;
  industry: string;
  products: string;
  certification: string;
  country: string;
  city: string;
  type: string;
  registered_capital: string;
  established_at: string;
  intro: string;
  // ── v2 诊断 19 列（未做诊断时全为空串）──
  english_evidence_level: string;
  english_meeting_capability: string;
  tender_experience: string;
  tender_amount_band: string;
  procurement_frameworks: string;
  mandatory_docs: string;
  ungm_status: string;
  compliance_governance: string;
  technical_response: string;
  cost_pricing: string;
  incoterms_capability: string;
  payment_terms: string;
  export_scale: string;
  submission_control: string;
  deliver_to_site: string;
  service_countries: string;
  overseas_companies: string;
  team_discipline: string;
  bid_willingness: string;
}

const s = (v: unknown) => String(v ?? "");

export async function fetchSupplierProfile(
  pool: Pool,
  userId: number,
): Promise<SupplierProfileForAi | null> {
  const [userRows] = await pool.query(
    "SELECT supplier_id FROM crm_users WHERE id = ? LIMIT 1",
    [userId],
  );
  const supplierId = Number((userRows as RowDataPacket[])[0]?.supplier_id || 0);
  if (!supplierId) return null;

  const [supRows] = await pool.query(
    `SELECT s.company, s.industry, s.products, s.certification, s.country, s.city, s.type,
            s.registered_capital, s.established_at, s.intro,
            ${diagnosisColumnSelect("q")}
     FROM supplier s
     LEFT JOIN crm_users u ON u.supplier_id = s.id
     LEFT JOIN crm_supplier_diagnosis q ON q.supplier_id = s.id AND q.user_id = u.id
     WHERE s.id = ?
     LIMIT 1`,
    [supplierId],
  );
  const row = (supRows as RowDataPacket[])[0];
  if (!row) return null;

  const profile: Record<string, string> = {
    company: s(row.company),
    industry: s(row.industry),
    products: s(row.products),
    certification: s(row.certification),
    country: s(row.country),
    city: s(row.city),
    type: s(row.type),
    registered_capital: s(row.registered_capital),
    established_at: s(row.established_at),
    intro: s(row.intro),
  };
  for (const column of DIAGNOSIS_COLUMNS) profile[column] = s(row[column]);
  return profile as SupplierProfileForAi;
}

/** 诊断列的短标签（仅用于喂给模型的字段名，不参与界面 i18n）。
 *  评分与拆标摘要两个 prompt 共用这一份，避免同一字段在两份提示词里叫两个名字。 */
export const DIAGNOSIS_AI_LABEL_ZH: Record<string, string> = {
  ungm_status: "UNGM注册",
  compliance_governance: "合规专岗与整改",
  english_evidence_level: "英文投标资料",
  english_meeting_capability: "英文答疑能力",
  tender_experience: "近24个月投标履历",
  tender_amount_band: "最近投标金额量级",
  technical_response: "技术响应与案例",
  mandatory_docs: "可即时提供的强制文件",
  deliver_to_site: "现场国交付",
  service_countries: "售后服务点国家",
  overseas_companies: "海外分公司国家",
  export_scale: "出口/国际业务规模",
  team_discipline: "投标团队与台账",
  procurement_frameworks: "熟悉采购文件体系",
  submission_control: "提交前复核流程",
  cost_pricing: "成本核算方式",
  incoterms_capability: "贸易条款报价能力",
  payment_terms: "30天以上账期",
  bid_willingness: "参与公采投标意愿",
};

/** 从画像字典里挑出诊断列的有值项，供 prompt 组装与画像完整度判定共用 */
export function diagnosisItemsOf(profile: Record<string, unknown>): Array<[string, string]> {
  return DIAGNOSIS_COLUMNS
    .map((column) => [column, String(profile[column] ?? "").trim()] as [string, string])
    .filter(([, value]) => value.length > 0);
}
