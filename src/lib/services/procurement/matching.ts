/**
 * 发布即匹配（规则版候选名单，流程第 7 步）
 * @module lib/services/procurement/matching
 *
 * @description 发布成功后按需求主品类 UGT 的 L1 段 + 交付省份筛供应商（仅平台核验 done），
 *              落 procurement_matches（uq 去重，可重复生成幂等）。评分模型属 P3，
 *              本规则版输出「行业 L1 匹配基础分 60 + 省份命中 20」。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

/** 从需求主品类（"UGT-0301" 族）取 L1 数字段（"03"）；非 UGT 前缀返回 null */
export function demandIndustrySegment(categoryCode: string | null | undefined): string | null {
  const code = String(categoryCode || "");
  if (!code.startsWith("UGT-")) return null;
  const seg = code.slice(4, 6);
  return /^[0-9]{2}$/.test(seg) ? seg : null;
}

export interface MatchCandidate {
  supplierId: number;
  company: string;
  province: string;
  city: string;
  score: number;
  reasons: string;
}

/**
 * 生成候选名单（幂等：IGNORE，重复发布不重复计）。返回本次新插入的候选数。
 */
export async function generateMatchCandidates(db: Pool, projectId: number): Promise<number> {
  const [rows] = await db.query(
    "SELECT primary_ugt_code, delivery_province FROM procurement_projects WHERE id = ? LIMIT 1",
    [projectId],
  );
  const row = (rows as RowDataPacket[])[0];
  if (!row) return 0;
  const segment = demandIndustrySegment(row.primary_ugt_code as string | null);
  if (!segment) return 0;
  const province = String(row.delivery_province ?? "");

  const [ins] = await db.query(
    `INSERT IGNORE INTO procurement_matches (project_id, supplier_id, score, reasons, status, created_at)
     SELECT * FROM (
       SELECT ?, s.id,
             60 + (? <> '' AND s.province = ?) * 20 AS score,
             CONCAT('行业L1:', ?, IF(? <> '' AND s.province = ?, ';省份', '')) AS reasons,
             'recommended' AS status,
             UNIX_TIMESTAMP() AS created_at
         FROM (
               SELECT DISTINCT i.supplier_id
                 FROM supplier_industry_rel i
                WHERE i.industry_code LIKE 'UGT-I-%'
                  AND LEFT(SUBSTRING_INDEX(i.industry_code, '-', -1), 2) = ?
              ) m
         JOIN supplier s ON s.id = m.supplier_id AND s.verify_status = 'done'
        ORDER BY score DESC
        LIMIT 50
     ) ranked`,
    [projectId, province, province, segment, province, province, segment],
  );
  return Number((ins as { affectedRows?: number }).affectedRows ?? 0);
}

/** 读取候选名单（工作台/详情消费） */
export async function listMatchCandidates(db: Pool, projectId: number, limit = 50): Promise<MatchCandidate[]> {
  const [rows] = await db.query(
    `SELECT m.supplier_id, m.score, m.reasons, s.company, s.province, s.city
       FROM procurement_matches m
       JOIN supplier s ON s.id = m.supplier_id
      WHERE m.project_id = ?
      ORDER BY m.score DESC, m.id ASC
      LIMIT ?`,
    [projectId, limit],
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
