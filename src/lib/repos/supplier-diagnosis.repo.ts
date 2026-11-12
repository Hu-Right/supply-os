/**
 * 供应商投标能力诊断 v2 数据访问层
 * Supplier Bid-Capability Diagnosis (v2) Repository
 *
 * @module lib/repos/supplier-diagnosis.repo
 * @description 只操作 `supplier_diagnosis`（v1 旧表已退役 DROP）。
 *              幂等口径（2026-11-11 一司一份定稿）：唯一键 `uk_supplier(supplier_id)`——
 *              一家公司只有一份诊断报告，报告属于公司不属于个人；重复提交走
 *              `INSERT ... ON DUPLICATE KEY UPDATE` 命中该唯一键，
 *              不使用「先 SELECT 再写」（并发下会双插）。
 *              写库后以 affectedRows + 回读双校验为准再报成功（本仓既有教训：不校验会静默零更新）。
 *              写权闸口：见 `diagnosisWriteGateDecision`（归属人放行，有主主体非归属人一律拒绝）。
 */
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { DIAGNOSIS_FIELDS } from "@/shared/constants/diagnosis-dimensions";
import type { DiagnosisAnswers } from "@/lib/services/scoring/diagnosis-v2";

/** 答案列（顺序即写入顺序），来自常量 SSOT，避免手写列名漂移 */
const ANSWER_COLUMNS = DIAGNOSIS_FIELDS.map((f) => f.column);

export interface DiagnosisRow extends RowDataPacket {
  id: number;
  user_id: number;
  supplier_id: number;
  company_name: string;
  schema_version: number;
  score_total: number | null;
  score_grade: string | null;
  score_breakdown: unknown;
  scored_at: Date | null;
  ip: string | null;
  submitted_at: Date;
  updated_at: Date | null;
}

/**
 * 行→作答集（回显与 PDF 报告共用）：多选列按逗号切回数组，其余列原样返回。
 * 放在仓储层是因为它依赖“哪一列是什么类型”的表结构知识，路由不应各自抄一份。
 */
export function diagnosisAnswersOf(row: DiagnosisRow): DiagnosisAnswers {
  const answers: DiagnosisAnswers = {};
  for (const field of DIAGNOSIS_FIELDS) {
    const raw = String((row as unknown as Record<string, unknown>)[field.column] ?? "");
    answers[field.key] =
      field.kind === "multi" ? raw.split(",").map((s) => s.trim()).filter(Boolean) : raw;
  }
  return answers;
}

export interface DiagnosisScoreSnapshot {
  totalScore: number;
  grade: string;
  breakdown: unknown;
}

export interface UpsertDiagnosisParams {
  userId: number;
  supplierId: number;
  companyName: string;
  answers: DiagnosisAnswers;
  score: DiagnosisScoreSnapshot;
  ip: string | null;
}

/** 写权闸口的主体事实（一条 SQL 取齐，见 getWriteGate） */
export interface DiagnosisGateFacts {
  /** 当前账号绑定在该主体上（临时或正式均算——绑定了就是「自己人」） */
  selfBound: boolean;
  /** 其他账号绑定在该主体上 */
  boundByOther: boolean;
  /** 存在 pending 认领（排他期） */
  claimPending: boolean;
  /** 存在 approved 认领（已归属） */
  claimed: boolean;
  /** 主体已认证（与门户公开目录同口径：只认显式 'done'，NULL 历史行不算） */
  verifyDone: boolean;
}

/**
 * 写权判定（纯函数，唯一规则实现）：
 *   归属人（selfBound）放行——他就是这个主体的（待审/正式）归属人；
 *   其余情况，只要主体「有主」（他人绑定 / 排他期 / 已归属 / 已认证）即拒绝。
 *   无主主体（未绑定、无认领、未认证）对全部登录用户开放。
 */
export function diagnosisWriteGateDecision(f: DiagnosisGateFacts): boolean {
  return f.selfBound || !(f.boundByOther || f.claimPending || f.claimed || f.verifyDone);
}

/** 成绩单行的最小字段集（详情页公开面的取数口径） */
export type ClaimantScorecardRow = {
  score_total: number | null;
  score_grade: string | null;
  score_breakdown: unknown;
  submitted_at: Date;
};

/** 多选列以逗号入库，读侧再切分；文本列去首尾空白 */
function toDbValue(fieldKey: string, raw: string | string[] | undefined): string {
  const field = DIAGNOSIS_FIELDS.find((f) => f.key === fieldKey)!;
  if (field.kind === "multi") {
    const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    return list.join(",");
  }
  return Array.isArray(raw) ? raw.join(",") : String(raw ?? "").trim();
}

export class SupplierDiagnosisRepo {
  constructor(private readonly pool: Pool) {}

  async findById(id: number): Promise<DiagnosisRow | null> {
    const [rows] = await this.pool.execute<DiagnosisRow[]>(
      `SELECT * FROM supplier_diagnosis WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** 回显用：本人全部诊断记录，一家公司一条，按最近提交倒序 */
  async findMine(userId: number): Promise<DiagnosisRow[]> {
    const [rows] = await this.pool.execute<DiagnosisRow[]>(
      `SELECT * FROM supplier_diagnosis WHERE user_id = ? ORDER BY submitted_at DESC, id DESC`,
      [userId],
    );
    return rows as DiagnosisRow[];
  }

  async findByUserAndSupplier(userId: number, supplierId: number): Promise<DiagnosisRow | null> {
    const [rows] = await this.pool.execute<DiagnosisRow[]>(
      `SELECT * FROM supplier_diagnosis WHERE user_id = ? AND supplier_id = ? LIMIT 1`,
      [userId, supplierId],
    );
    return rows[0] ?? null;
  }

  /** 一司一份口径下的主体级回读（报告属于公司，最后写入者的 user_id 落在行上） */
  async findBySupplierId(supplierId: number): Promise<DiagnosisRow | null> {
    const [rows] = await this.pool.execute<DiagnosisRow[]>(
      `SELECT * FROM supplier_diagnosis WHERE supplier_id = ? LIMIT 1`,
      [supplierId],
    );
    return rows[0] ?? null;
  }

  /**
   * 详情页公开成绩单取数：只认「归属人提交」的报告。
   * 一司一份下 user_id = 最后写入者，JOIN users 限定「该账号仍绑定在本主体上」：
   * 路人写的无主报告不上详情页；归属人覆盖后自然接管；归属人被解绑则报告随之退场。
   */
  async findClaimantScorecard(supplierId: number): Promise<ClaimantScorecardRow | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT d.score_total, d.score_grade, d.score_breakdown, d.submitted_at
         FROM supplier_diagnosis d
         JOIN users u ON u.id = d.user_id AND u.supplier_id = d.supplier_id
        WHERE d.supplier_id = ? AND u.supplier_link_status = 'verified'
        LIMIT 1`,
      [supplierId],
    );
    const row = rows[0] as ClaimantScorecardRow | undefined;
    return row ?? null;
  }

  /**
   * 写权闸口的主体事实：一条 SQL 取齐（users 绑定 + claims 派生 + 认证标）。
   * 判定规则在纯函数 `diagnosisWriteGateDecision`（可单测，不在 SQL 里藏规则）；
   * 主体不存在返回 null（调用方已先做存在性校验，这里兜底按拒绝处理）。
   * 路由层除判定外还消费事实本身（selfBound=false 即「无主主体上的路人诊断」，
   * 供结果页透出认领引导 subjectUnclaimed）。
   */
  async getWriteGateFacts(supplierId: number, userId: number): Promise<DiagnosisGateFacts | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
         EXISTS(SELECT 1 FROM users u WHERE u.supplier_id = s.id AND u.id = ?)  AS self_bound,
         EXISTS(SELECT 1 FROM users u2 WHERE u2.supplier_id = s.id AND u2.id <> ?) AS bound_others,
         EXISTS(SELECT 1 FROM supplier_claims c WHERE c.supplier_id = s.id AND c.status = 'pending')  AS claim_pending,
         EXISTS(SELECT 1 FROM supplier_claims c2 WHERE c2.supplier_id = s.id AND c2.status = 'approved') AS claimed,
         (s.verify_status = 'done') AS verify_done
       FROM supplier s WHERE s.id = ? LIMIT 1`,
      [userId, userId, supplierId, supplierId, supplierId],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      selfBound: Number(row.self_bound) === 1,
      boundByOther: Number(row.bound_others) === 1,
      claimPending: Number(row.claim_pending) === 1,
      claimed: Number(row.claimed) === 1,
      verifyDone: Number(row.verify_done) === 1,
    };
  }

  /** 写权闸口布尔版（getWriteGateFacts + 纯函数判定的组合快捷方式）。 */
  async getWriteGate(supplierId: number, userId: number): Promise<boolean> {
    const facts = await this.getWriteGateFacts(supplierId, userId);
    return facts ? diagnosisWriteGateDecision(facts) : false;
  }

  /**
   * 幂等写入一行诊断 + 评分快照。
   * @returns 落库后的行（回读，含 id 与已存分值），调用方据此直接返回前端
   */
  async upsertDiagnosis(params: UpsertDiagnosisParams): Promise<DiagnosisRow> {
    const values: unknown[] = [
      params.userId,
      params.supplierId,
      params.companyName.trim(),
      ...DIAGNOSIS_FIELDS.map((f) => toDbValue(f.key, params.answers[f.key])),
      params.ip,
      params.score.totalScore,
      params.score.grade,
      JSON.stringify(params.score.breakdown),
    ];

    const insertCols = [
      "user_id",
      "supplier_id",
      "company_name",
      ...ANSWER_COLUMNS,
      "ip",
      "score_total",
      "score_grade",
      "score_breakdown",
    ];
    const placeholders = insertCols.map(() => "?").join(", ");
    // submitted_at / scored_at 由服务端时钟统一写入，不接受客户端时间
    const updateSets = [
      "company_name = VALUES(company_name)",
      ...ANSWER_COLUMNS.map((c) => `${c} = VALUES(${c})`),
      "ip = VALUES(ip)",
      "score_total = VALUES(score_total)",
      "score_grade = VALUES(score_grade)",
      "score_breakdown = VALUES(score_breakdown)",
      "scored_at = NOW()",
      "submitted_at = NOW()",
    ].join(", ");

    const [result] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO supplier_diagnosis (${insertCols.join(", ")}, scored_at, submitted_at)
       VALUES (${placeholders}, NOW(), NOW())
       ON DUPLICATE KEY UPDATE ${updateSets}`,
      values,
    );

    // 1=新插入，2=命中唯一键更新，0=值完全相同（MySQL 幂等更新不算变更，仍视为成功）
    if (result.affectedRows > 2) {
      throw new Error(`Unexpected affectedRows on diagnosis upsert: ${result.affectedRows}`);
    }

    const stored = await this.findBySupplierId(params.supplierId);
    if (!stored) throw new Error("Diagnosis upsert read-back failed: row not found after write");
    if (Number(stored.score_total) !== Number(params.score.totalScore)) {
      throw new Error(
        `Diagnosis score snapshot mismatch after write: stored=${String(stored.score_total)} expected=${String(params.score.totalScore)}`,
      );
    }
    return stored;
  }
}
