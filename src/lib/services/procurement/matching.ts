/**
 * 发布即匹配（规则版候选名单，流程第 7 步）
 * @module lib/services/procurement/matching
 *
 * @description 2026-11-15 重写。旧的实现只用 `supplier_industry_rel`（实测仅覆盖 13,009 / 95,997
 *              家已核验供应商，13.5%），放着 `supplier.industry_code`（94,582 家，98.5%）不用；
 *              `primary_ugt_code` 为空时又直接 return 0，连候选都不生成。
 *
 *              新口径：
 *                1. 品类主信号换成 `supplier.industry_code`，按 L3 > L2 > L1（40/30/20）三档互斥；
 *                2. `supplier_industry_rel` 降为 +8 的辅助加权（有则加分，无则不扣）；
 *                3. 合作中 +10、资料质量最多 +10、已有账号 +15（后者同时决定触达通道）。
 *                   原「省份 +15」随迁移 026 删除 `delivery_province` 一并移除：该列从无写入源，
 *                   加分恒 0、归一化分母恒不含它，删除前后严格语义等价；将来恢复省份匹配需要
 *                   结构化省份码（从地区选择器产生），而不是复用自由文本列。
 *                4. **分数按"本次可得信号"的满分归一**，不按固定 100 —— 96% 的供应商没有
 *                   `business_type_code`，固定满分等于系统性惩罚资料不全，会把匹配变成"筛填得全的"。
 *
 *              候选仍落 `procurement_matches`（"可能合适"的快照）；"是否真的邀约过"由
 *              `procurement_invitations`（迁移 023）承载。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

/** 品类三段前缀；位数不足时更低层次为 null（避免与上一层重复计分） */
export interface CategoryPath {
  l1: string;
  l2: string | null;
  l3: string | null;
}

/** 从需求主品类码（`UGT-030201`）取三段前缀；非 UGT- 前缀或非数字返回 null */
export function demandCategoryPath(code: string | null | undefined): CategoryPath | null {
  const raw = String(code ?? "").trim();
  const m = /^UGT-(\d{4,10})$/.exec(raw);
  if (!m) return null;
  const d = m[1];
  return {
    l1: d.slice(0, 2),
    l2: d.length >= 4 ? d.slice(0, 4) : null,
    l3: d.length >= 6 ? d.slice(0, 6) : null,
  };
}

/**
 * 兼容旧导出（旧调用方按 L1 段取）。新代码请用 `demandCategoryPath`。
 * @deprecated 2026-11-15
 */
export function demandIndustrySegment(code: string | null | undefined): string | null {
  return demandCategoryPath(code)?.l1 ?? null;
}

// ── 打分（SQL 算原始分，TS 归一化，便于单测）────────────────────────────────

export interface RawScore {
  catScore: number;
  coopScore: number;
  qualityScore: number;
  accountScore: number;
  relScore: number;
}

export function totalRawScore(raw: RawScore): number {
  return raw.catScore + raw.coopScore + raw.qualityScore + raw.accountScore + raw.relScore;
}

/**
 * 按可得信号的满分（denom）归一化到 0–100。
 * denom 由调用方按"本次需求确实能给出的信号"计算，缺失信号既不进分子也不进分母。
 */
export function normalizeScore(raw: RawScore, denom: number): number {
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  const pct = Math.round((totalRawScore(raw) / denom) * 100);
  return Math.max(0, Math.min(100, pct));
}

/** 命中理由：让采购方看得懂"为什么推给他" */
export function buildReasons(
  raw: RawScore,
  ctx: { hasAccount: boolean; quality: number },
): string {
  const parts: string[] = [];
  if (raw.catScore >= 40) parts.push("品类L3");
  else if (raw.catScore >= 30) parts.push("品类L2");
  else if (raw.catScore > 0) parts.push("品类L1");
  if (raw.relScore > 0) parts.push("行业标签");
  if (raw.coopScore > 0) parts.push("合作中");
  if (ctx.quality > 0) parts.push(`资料分${Math.round(ctx.quality)}`);
  if (ctx.hasAccount) parts.push("已注册");
  return parts.join(";");
}

// ── 候选生成 ────────────────────────────────────────────────────────────────

export interface MatchCandidate {
  supplierId: number;
  company: string;
  province: string;
  city: string;
  email: string;
  hasAccount: boolean;
  score: number;
  reasons: string;
}

interface CandidateRow {
  supplier_id: number;
  company: string;
  province: string | null;
  city: string | null;
  email: string | null;
  data_quality: number | null;
  cat_score: number;
  coop_score: number;
  quality_score: number;
  account_score: number;
  rel_score: number;
}

/** 候选上限：候选表留给工作台看的池子，邀约只取其中的 top N */
const CANDIDATE_POOL = 100;

/**
 * 生成候选名单（幂等：唯一键冲突时刷新分数与理由，不新增行）。
 * @returns 本次写入/刷新的行数
 */
export async function generateMatchCandidates(db: Pool, projectId: number): Promise<number> {
  const [projRows] = (await db.query(
    "SELECT primary_ugt_code FROM procurement_projects WHERE id = ? LIMIT 1",
    [projectId],
  )) as unknown as [Array<{ primary_ugt_code: string | null }>];
  const project = projRows[0];
  if (!project) return 0;

  // 品类兜底：主品类可能为空（向导允许逐行填明细），退回第一条明细的 ugt_code
  let code = project.primary_ugt_code;
  if (!code) {
    const [itemRows] = (await db.query(
      `SELECT ugt_code FROM procurement_items
        WHERE project_id = ? AND ugt_code IS NOT NULL AND ugt_code <> ''
        ORDER BY line_no LIMIT 1`,
      [projectId],
    )) as unknown as [Array<{ ugt_code: string | null }>];
    code = itemRows[0]?.ugt_code ?? null;
  }

  const path = demandCategoryPath(code);
  if (!path) {
    console.warn(
      `[procurement] 需求 ${projectId} 无可用的品类码（primary_ugt_code 与明细 ugt_code 均为空/非法），跳过匹配`,
    );
    return 0;
  }

  // 原始分：品类三档互斥取最高；合作/质量/账号/行业标签为加分项
  //
  // 供应商行业码的形态是 `UGT-I-<数字>`，数字段长度实测分布 8 位 66,256 / 4 位 21,895 /
  // 6 位 6,047 / 2 位 384 —— 与需求码 `UGT-<数字>` 的数字段不同段位，必须都用
  // SUBSTRING_INDEX 取最后一段再比前缀，否则 LEFT(industry_code,2) 永远得到 "UG"。
  const [rows] = (await db.query(
    `SELECT * FROM (
       SELECT s.id AS supplier_id,
              s.company,
              s.province,
              s.city,
              s.email,
              s.data_quality_score AS data_quality,
              (CASE
                 WHEN ? IS NOT NULL AND LEFT(SUBSTRING_INDEX(s.industry_code, '-', -1), 6) = ? THEN 40
                 WHEN ? IS NOT NULL AND LEFT(SUBSTRING_INDEX(s.industry_code, '-', -1), 4) = ? THEN 30
                 WHEN LEFT(SUBSTRING_INDEX(s.industry_code, '-', -1), 2) = ? THEN 20
                 ELSE 0 END) AS cat_score,
              (CASE WHEN s.coop_status = 1 THEN 10 ELSE 0 END) AS coop_score,
              LEAST(10, ROUND(COALESCE(s.data_quality_score, 0) / 10)) AS quality_score,
              (CASE WHEN EXISTS (
                      SELECT 1 FROM supplier_claims c
                       WHERE c.supplier_id = s.id AND c.status = 'approved'
                    ) THEN 15 ELSE 0 END) AS account_score,
              (CASE WHEN EXISTS (
                      SELECT 1 FROM supplier_industry_rel r
                       WHERE r.supplier_id = s.id
                         AND LEFT(SUBSTRING_INDEX(r.industry_code, '-', -1), 2) = ?
                    ) THEN 8 ELSE 0 END) AS rel_score
         FROM supplier s
        WHERE s.verify_status = 'done'
          AND s.industry_code LIKE ?
     ) t
     ORDER BY (cat_score + coop_score + quality_score + account_score + rel_score) DESC,
              quality_score DESC, supplier_id DESC
     LIMIT ?`,
    [
      path.l3,
      path.l3,
      path.l2,
      path.l2,
      path.l1,
      path.l1,
      `UGT-I-${path.l1}%`,
      CANDIDATE_POOL,
    ],
  )) as unknown as [CandidateRow[]];

  if (!rows.length) return 0;

  // 可得满分：品类 40（L1 过滤已保证）、合作 10、质量 10、行业标签 8、账号 15
  const denom = 40 + 10 + 10 + 8 + 15;

  const values = rows.map((r) => {
    const raw: RawScore = {
      catScore: Number(r.cat_score ?? 0),
      coopScore: Number(r.coop_score ?? 0),
      qualityScore: Number(r.quality_score ?? 0),
      accountScore: Number(r.account_score ?? 0),
      relScore: Number(r.rel_score ?? 0),
    };
    return [
      projectId,
      Number(r.supplier_id),
      normalizeScore(raw, denom),
      buildReasons(raw, {
        hasAccount: Number(r.account_score ?? 0) > 0,
        quality: Number(r.data_quality ?? 0),
      }),
      "recommended",
      Math.floor(Date.now() / 1000),
    ];
  });

  const [ins] = await db.query(
    `INSERT INTO procurement_matches (project_id, supplier_id, score, reasons, status, created_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE score = VALUES(score), reasons = VALUES(reasons)`,
    [values],
  );
  return Number((ins as { affectedRows?: number }).affectedRows ?? 0);
}

/** 读取候选名单（工作台/详情消费） */
export async function listMatchCandidates(
  db: Pool,
  projectId: number,
  limit = CANDIDATE_POOL,
): Promise<MatchCandidate[]> {
  const [rows] = (await db.query(
    `SELECT m.supplier_id, m.score, m.reasons, s.company, s.province, s.city, s.email,
            EXISTS (SELECT 1 FROM supplier_claims c
                     WHERE c.supplier_id = s.id AND c.status = 'approved') AS has_account
       FROM procurement_matches m
       JOIN supplier s ON s.id = m.supplier_id
      WHERE m.project_id = ?
      ORDER BY m.score DESC, m.id ASC
      LIMIT ?`,
    [projectId, limit],
  )) as unknown as [RowDataPacket[]];

  return rows.map((r) => ({
    supplierId: Number(r.supplier_id),
    company: String(r.company ?? ""),
    province: String(r.province ?? ""),
    city: String(r.city ?? ""),
    email: String(r.email ?? ""),
    hasAccount: Number(r.has_account ?? 0) === 1,
    score: Number(r.score ?? 0),
    reasons: String(r.reasons ?? ""),
  }));
}
