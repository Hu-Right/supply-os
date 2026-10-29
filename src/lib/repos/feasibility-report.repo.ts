/**
 * 投标可行性报告 —— 数据访问层
 *
 * @module lib/repos/feasibility-report.repo
 * @description 只操作 4 张新表 + 读取 notice_public / bid_opportunities / supplier /
 *              supplier_diagnosis。业务判定不在这里，保持薄 IO 层。
 */
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type {
  CapabilityRowLike,
  DiagnosisRowLike,
  EvidenceRowLike,
  OpportunityRowLike,
  PublicNoticeRowLike,
  RequirementRowLike,
  SupplierRowLike,
} from "../services/feasibility-report/inputs";
import type { RequirementItem } from "../services/feasibility-report/types";

export interface ReportHistoryRow {
  id: number;
  input_hash: string;
  prompt_version: string;
  created_at: string;
  decision: string | null;
  score: number | string | null;
  generated_at: string | null;
}

export interface FeasibilityReportRow {
  report_json: unknown;
  input_hash: string;
  prompt_version: string;
  model: string | null;
  created_at: string;
}

export interface VerifiedSupplierRow extends SupplierRowLike {
  supplier_link_status: string | null;
}

export class FeasibilityReportRepo {
  constructor(private pool: Pool) {}

  /** 账号绑定的已认证企业（未绑定/未认证返回 null） */
  async findVerifiedSupplierForUser(userId: number): Promise<VerifiedSupplierRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT s.id, s.company, s.country, s.industry_code, s.certification, s.certification_tags,
              s.business_type, s.verify_status, u.supplier_link_status
         FROM users u
         JOIN supplier s ON s.id = u.supplier_id
        WHERE u.id = ? AND u.supplier_link_status = 'verified'
        LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    return row ? (row as unknown as VerifiedSupplierRow) : null;
  }

  async findSupplierById(supplierId: number): Promise<SupplierRowLike | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, company, country, industry_code, certification, certification_tags, business_type, verify_status
         FROM supplier WHERE id = ? LIMIT 1`,
      [supplierId],
    );
    return rows[0] ? (rows[0] as unknown as SupplierRowLike) : null;
  }

  async findDiagnosis(userId: number, supplierId: number): Promise<DiagnosisRowLike | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT user_id, supplier_id, company_name, ungm_status, tender_experience, mandatory_docs,
              english_evidence_level, team_discipline
         FROM supplier_diagnosis WHERE user_id = ? AND supplier_id = ? LIMIT 1`,
      [userId, supplierId],
    );
    return rows[0] ? (rows[0] as unknown as DiagnosisRowLike) : null;
  }

  async getNotice(noticePk: number): Promise<PublicNoticeRowLike | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT notice_pk, notice_id, title, description, description_cn, country_code, notice_type_code,
              buyer_name, deadline_ts, FROM_UNIXTIME(deadline_ts) AS deadline, attachments
         FROM notice_public WHERE notice_pk = ? LIMIT 1`,
      [noticePk],
    );
    return rows[0] ? (rows[0] as unknown as PublicNoticeRowLike & { notice_id: string | number }) : null;
  }

  async getOpportunityByNoticeId(noticeId: string | number): Promise<OpportunityRowLike | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT eligibility, technical_hurdles, supplier_conditions, bid_overview
         FROM bid_opportunities WHERE source_notice_id = ? ORDER BY id DESC LIMIT 1`,
      [String(noticeId)],
    );
    return rows[0] ? (rows[0] as unknown as OpportunityRowLike) : null;
  }

  async listCapabilityRows(enterpriseId: number): Promise<CapabilityRowLike[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, enterprise_id, capability_type, name, value_json, evidence_refs_json, confirmation_json
         FROM enterprise_capability_items WHERE enterprise_id = ? ORDER BY id`,
      [enterpriseId],
    );
    return rows as unknown as CapabilityRowLike[];
  }

  async listEvidenceRows(enterpriseId: number): Promise<EvidenceRowLike[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, enterprise_id, upload_file_id, category, title, valid_from, valid_until, no_expiry, confirmed
         FROM enterprise_evidence WHERE enterprise_id = ? ORDER BY id DESC LIMIT 200`,
      [enterpriseId],
    );
    return rows as unknown as EvidenceRowLike[];
  }

  /** 最新一版要求项（无记录返回空数组） */
  async getLatestRequirements(noticePk: number): Promise<{ version: number; rows: RequirementRowLike[] }> {
    const [versions] = await this.pool.query<RowDataPacket[]>(
      "SELECT MAX(version) AS v FROM notice_requirement_items WHERE notice_pk = ?",
      [noticePk],
    );
    const version = Number(versions[0]?.v ?? 0);
    if (!version) return { version: 0, rows: [] };
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, notice_pk, version, seq, requirement_type, importance, title, value_json, raw_text,
              source_json, extraction_method, confidence, prompt_version
         FROM notice_requirement_items WHERE notice_pk = ? AND version = ? ORDER BY seq`,
      [noticePk, version],
    );
    return { version, rows: rows as unknown as RequirementRowLike[] };
  }

  /** 写入新一版要求项（版本号 = max+1），返回新版本号 */
  async saveRequirements(
    noticePk: number,
    items: RequirementItem[],
    promptVersion: string,
  ): Promise<number> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [versions] = await conn.query<RowDataPacket[]>(
        "SELECT MAX(version) AS v FROM notice_requirement_items WHERE notice_pk = ? FOR UPDATE",
        [noticePk],
      );
      const version = Number(versions[0]?.v ?? 0) + 1;
      for (const item of items) {
        await conn.execute<ResultSetHeader>(
          `INSERT INTO notice_requirement_items
             (notice_pk, version, seq, requirement_type, importance, title, value_json, raw_text,
              source_json, extraction_method, confidence, prompt_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            noticePk,
            version,
            item.seq,
            item.type,
            item.importance,
            item.title,
            item.value == null ? null : JSON.stringify(item.value),
            item.rawText,
            JSON.stringify(item.source),
            item.extraction?.method ?? "llm",
            item.extraction?.confidence ?? 0.8,
            promptVersion,
          ],
        );
      }
      await conn.commit();
      return version;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** 最新报告（无则 null） */
  async getLatestReport(noticePk: number, enterpriseId: number): Promise<FeasibilityReportRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT report_json, input_hash, prompt_version, model, created_at
         FROM feasibility_reports WHERE notice_pk = ? AND enterprise_id = ?
        ORDER BY id DESC LIMIT 1`,
      [noticePk, enterpriseId],
    );
    return rows[0] ? (rows[0] as unknown as FeasibilityReportRow) : null;
  }

  /** 按输入 hash 取缓存报告（同一输入不重复生成） */
  async findReportByHash(
    noticePk: number,
    enterpriseId: number,
    inputHash: string,
  ): Promise<FeasibilityReportRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT report_json, input_hash, prompt_version, model, created_at
         FROM feasibility_reports WHERE notice_pk = ? AND enterprise_id = ? AND input_hash = ? LIMIT 1`,
      [noticePk, enterpriseId, inputHash],
    );
    return rows[0] ? (rows[0] as unknown as FeasibilityReportRow) : null;
  }

  /** 写入/覆盖报告（唯一键 notice+enterprise+input_hash） */
  async saveReport(params: {
    noticePk: number;
    enterpriseId: number;
    inputHash: string;
    report: unknown;
    promptVersion: string;
    model: string | null;
  }): Promise<void> {
    await this.pool.execute<ResultSetHeader>(
      `INSERT INTO feasibility_reports
         (notice_pk, enterprise_id, input_hash, report_json, prompt_version, model, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ready')
       ON DUPLICATE KEY UPDATE
         report_json = VALUES(report_json),
         prompt_version = VALUES(prompt_version),
         model = VALUES(model),
         status = 'ready'`,
      [
        params.noticePk,
        params.enterpriseId,
        params.inputHash,
        JSON.stringify(params.report),
        params.promptVersion,
        params.model,
      ],
    );
  }

  /** 报告历史版本（最近 N 条，按时间倒序） */
  async listReports(noticePk: number, enterpriseId: number, limit = 20): Promise<ReportHistoryRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, input_hash, prompt_version, created_at,
              JSON_UNQUOTE(JSON_EXTRACT(report_json, '$.verdict.decision')) AS decision,
              JSON_EXTRACT(report_json, '$.verdict.score') AS score,
              JSON_UNQUOTE(JSON_EXTRACT(report_json, '$.meta.generatedAt')) AS generated_at
         FROM feasibility_reports
        WHERE notice_pk = ? AND enterprise_id = ?
        ORDER BY id DESC LIMIT ?`,
      [noticePk, enterpriseId, limit],
    );
    return rows as unknown as ReportHistoryRow[];
  }
}
