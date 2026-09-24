/**
 * 供应商投标能力诊断 v2 数据访问层
 * Supplier Bid-Capability Diagnosis (v2) Repository
 *
 * @module lib/repos/supplier-diagnosis.repo
 * @description 只操作新表 `crm_supplier_diagnosis`，不读写 v1 的 `crm_supplier_qualification`
 *              （本轮硬约束：原表一行不改）。幂等口径是规范 N5——一个用户 × 一家公司只有一行，
 *              重复提交走 `INSERT ... ON DUPLICATE KEY UPDATE` 命中唯一键 `uk_user_supplier`，
 *              不使用「先 SELECT 再写」（并发下会双插）。
 *              写库后以 affectedRows + 回读双校验为准再报成功（本仓既有教训：不校验会静默零更新）。
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
  audit_status: string;
  schema_version: number;
  score_total: number | null;
  score_grade: string | null;
  score_breakdown: unknown;
  scored_at: Date | null;
  ip: string | null;
  submitted_at: Date;
  reviewed_at: Date | null;
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
      `SELECT * FROM crm_supplier_diagnosis WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** 回显用：本人全部诊断记录，一家公司一条，按最近提交倒序 */
  async findMine(userId: number): Promise<DiagnosisRow[]> {
    const [rows] = await this.pool.execute<DiagnosisRow[]>(
      `SELECT * FROM crm_supplier_diagnosis WHERE user_id = ? ORDER BY submitted_at DESC, id DESC`,
      [userId],
    );
    return rows as DiagnosisRow[];
  }

  async findByUserAndSupplier(userId: number, supplierId: number): Promise<DiagnosisRow | null> {
    const [rows] = await this.pool.execute<DiagnosisRow[]>(
      `SELECT * FROM crm_supplier_diagnosis WHERE user_id = ? AND supplier_id = ? LIMIT 1`,
      [userId, supplierId],
    );
    return rows[0] ?? null;
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
      `INSERT INTO crm_supplier_diagnosis (${insertCols.join(", ")}, scored_at, submitted_at)
       VALUES (${placeholders}, NOW(), NOW())
       ON DUPLICATE KEY UPDATE ${updateSets}`,
      values,
    );

    // 1=新插入，2=命中唯一键更新，0=值完全相同（MySQL 幂等更新不算变更，仍视为成功）
    if (result.affectedRows > 2) {
      throw new Error(`Unexpected affectedRows on diagnosis upsert: ${result.affectedRows}`);
    }

    const stored = await this.findByUserAndSupplier(params.userId, params.supplierId);
    if (!stored) throw new Error("Diagnosis upsert read-back failed: row not found after write");
    if (Number(stored.score_total) !== Number(params.score.totalScore)) {
      throw new Error(
        `Diagnosis score snapshot mismatch after write: stored=${String(stored.score_total)} expected=${String(params.score.totalScore)}`,
      );
    }
    return stored;
  }
}
