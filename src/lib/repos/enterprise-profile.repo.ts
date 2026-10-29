/**
 * 企业能力档案 / 证据资料库 —— 数据访问层（v0.2）
 *
 * @module lib/repos/enterprise-profile.repo
 * @description 企业侧 `enterprise_capability_items` / `enterprise_evidence` / `upload_files`
 *              的读写；企业主体解析 = 账号绑定的已认证 supplier。
 */
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

export interface VerifiedEnterpriseRow {
  id: number;
  company: string | null;
  certification: string | null;
  certification_tags: unknown;
  country: string | null;
}

export interface CapabilityRow {
  id: number;
  enterprise_id: number;
  capability_type: string;
  name: string;
  value_json: unknown;
  evidence_refs_json: unknown;
  confirmation_json: unknown;
}

export interface EvidenceRow {
  id: number;
  enterprise_id: number;
  upload_file_id: number | null;
  category: string;
  title: string;
  valid_from: string | null;
  valid_until: string | null;
  no_expiry: number;
  confirmed: number;
  created_at: string;
}

export class EnterpriseProfileRepo {
  constructor(private pool: Pool) {}

  async findVerifiedEnterprise(userId: number): Promise<VerifiedEnterpriseRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT s.id, s.company, s.certification, s.certification_tags, s.country
         FROM users u JOIN supplier s ON s.id = u.supplier_id
        WHERE u.id = ? AND u.supplier_link_status = 'verified' LIMIT 1`,
      [userId],
    );
    return rows[0] ? (rows[0] as unknown as VerifiedEnterpriseRow) : null;
  }

  async listCapabilities(enterpriseId: number): Promise<CapabilityRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, enterprise_id, capability_type, name, value_json, evidence_refs_json, confirmation_json
         FROM enterprise_capability_items WHERE enterprise_id = ? ORDER BY id DESC`,
      [enterpriseId],
    );
    return rows as unknown as CapabilityRow[];
  }

  async insertCapability(params: {
    enterpriseId: number;
    capabilityType: string;
    name: string;
    value: unknown;
    evidenceRefs: unknown;
    confirmation: unknown;
  }): Promise<number> {
    const [res] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO enterprise_capability_items
         (enterprise_id, capability_type, name, value_json, evidence_refs_json, confirmation_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.enterpriseId,
        params.capabilityType,
        params.name,
        JSON.stringify(params.value),
        JSON.stringify(params.evidenceRefs),
        JSON.stringify(params.confirmation),
      ],
    );
    return Number(res.insertId);
  }

  async deleteCapability(enterpriseId: number, id: number): Promise<boolean> {
    const [res] = await this.pool.execute<ResultSetHeader>(
      "DELETE FROM enterprise_capability_items WHERE id = ? AND enterprise_id = ?",
      [id, enterpriseId],
    );
    return res.affectedRows > 0;
  }

  async listEvidence(enterpriseId: number): Promise<EvidenceRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, enterprise_id, upload_file_id, category, title, valid_from, valid_until, no_expiry, confirmed, created_at
         FROM enterprise_evidence WHERE enterprise_id = ? ORDER BY id DESC`,
      [enterpriseId],
    );
    return rows as unknown as EvidenceRow[];
  }

  /** 证据文件字节入 upload_files（与执照同一张表/同一套共享库口径） */
  async insertUploadFile(params: {
    filename: string;
    buffer: Buffer;
    contentType: string;
    uploadedBy: number;
  }): Promise<number> {
    const [res] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO upload_files (filename, content, content_type, size_bytes, uploaded_by)
       VALUES (?, ?, ?, ?, ?)`,
      [params.filename, params.buffer, params.contentType, params.buffer.length, params.uploadedBy],
    );
    return Number(res.insertId);
  }

  async insertEvidence(params: {
    enterpriseId: number;
    uploadFileId: number | null;
    category: string;
    title: string;
    validFrom: string | null;
    validUntil: string | null;
    noExpiry: boolean;
    confirmed: boolean;
  }): Promise<number> {
    const [res] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO enterprise_evidence
         (enterprise_id, upload_file_id, category, title, valid_from, valid_until, no_expiry, confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.enterpriseId,
        params.uploadFileId,
        params.category,
        params.title,
        params.validFrom,
        params.validUntil,
        params.noExpiry ? 1 : 0,
        params.confirmed ? 1 : 0,
      ],
    );
    return Number(res.insertId);
  }

  async deleteEvidence(enterpriseId: number, id: number): Promise<{ deleted: boolean; uploadFileId: number | null }> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT upload_file_id FROM enterprise_evidence WHERE id = ? AND enterprise_id = ? LIMIT 1",
      [id, enterpriseId],
    );
    if (!rows[0]) return { deleted: false, uploadFileId: null };
    await this.pool.execute("DELETE FROM enterprise_evidence WHERE id = ? AND enterprise_id = ?", [id, enterpriseId]);
    return { deleted: true, uploadFileId: rows[0].upload_file_id == null ? null : Number(rows[0].upload_file_id) };
  }
}
