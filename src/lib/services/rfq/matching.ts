/**
 * 发布即匹配（规则版候选名单）
 * @module lib/services/rfq/matching
 *
 * @description 七步流程第 7 步：「正式发布采购需求，开始供应商智能匹配」的 MVP 实现——
 *              发布成功后按需求的行业 L1 段 + 省份筛供应商，落 rfq_match_candidates
 *              候选底表（uq 去重，可重复生成幂等刷新）。
 *
 *              口径（有意简单，评分模型属 P3）：
 *              · 行业匹配：supplier_industry_rel.industry_code（"UGT-I-0305" 族）取
 *                "UGT-I-" 后前两位数字段 = rfq_demand.category_code（"UGT-0301" 族）
 *                的 L1 段（第 5-6 位），命中即入围，基础分 60；
 *              · 省份命中加分 20（supplier.province 与需求 province_name 逐字相等）；
 *              · 仅纳入 verify_status='done'（平台核验可展示）的供应商；
 *              · 单需求最多 50 家，IGNORE 幂等——重发布不重复计。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

/** 从需求 category_code（"UGT-0301" 族）取 L1 数字段（"03"）；非 UGT 前缀返回 null */
export function demandIndustrySegment(categoryCode: string): string | null {
  const code = String(categoryCode || "");
  if (!code.startsWith("UGT-")) return null;
  const seg = code.slice(4, 6);
  return /^[0-9]{2}$/.test(seg) ? seg : null;
}

/**
 * 生成候选名单（幂等：IGNORE，重发布不重复计）。
 * 返回本次新插入的候选数。
 */
export async function generateMatchCandidates(db: Pool, demandId: number): Promise<number> {
  const [rows] = await db.query(
    "SELECT category_code, province_name FROM rfq_demand WHERE id = ? LIMIT 1",
    [demandId],
  );
  const row = (rows as RowDataPacket[])[0];
  if (!row) return 0;
  const segment = demandIndustrySegment(String(row.category_code ?? ""));
  if (!segment) return 0;
  const province = String(row.province_name ?? "");

  const [ins] = await db.execute(
    `INSERT IGNORE INTO rfq_match_candidates (demand_id, supplier_id, score, reasons, created_at)
     SELECT ?, s.id,
            60 + (s.province = ?) * 20,
            CONCAT('行业L1:', ?, IF(s.province = ?, ';省份', '')),
            UNIX_TIMESTAMP()
       FROM (
             SELECT DISTINCT i.supplier_id
               FROM supplier_industry_rel i
              WHERE i.industry_code LIKE 'UGT-I-%'
                AND LEFT(SUBSTRING_INDEX(i.industry_code, '-', -1), 2) = ?
            ) m
       JOIN supplier s ON s.id = m.supplier_id AND s.verify_status = 'done'
      ORDER BY score DESC
      LIMIT 50`,
    [demandId, province, segment, province, Math.floor(Date.now() / 1000), segment],
  );
  return Number((ins as { affectedRows?: number }).affectedRows ?? 0);
}

export interface MatchCandidate {
  supplierId: number;
  company: string;
  province: string;
  city: string;
  score: number;
  reasons: string;
}

/** 读取候选名单（工作台/详情消费） */
export async function listMatchCandidates(db: Pool, demandId: number, limit = 50): Promise<MatchCandidate[]> {
  const [rows] = await db.query(
    `SELECT c.supplier_id, c.score, c.reasons, s.company, s.province, s.city
       FROM rfq_match_candidates c
       JOIN supplier s ON s.id = c.supplier_id
      WHERE c.demand_id = ?
      ORDER BY c.score DESC, c.id ASC
      LIMIT ?`,
    [demandId, limit],
  );
  return (rows as RowDataPacket[]).map((r) => ({
    supplierId: Number(r.supplier_id),
    company: String(r.company ?? ""),
    province: String(r.province ?? ""),
    city: String(r.city ?? ""),
    score: Number(r.score ?? 0),
    reasons: String(r.reasons ?? ""),
  }));
}
