/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 培训报名 + 系统配置数据访问层
 * Training & System Repository
 *
 * @module repos/training.repo
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export class TrainingRepo {
  constructor(private pool: Pool) {}

  /** 研修班报名，返回自增 id */
  async insertRegistration(data: {
    companyName: string;
    industryId: number | null;
    industry: string;
    mainProduct: string;
    exportExperience: string;
    certification: string;
    contactName: string;
    position: string;
    telephone: string;
    email: string;
    remark: string;
    ip: string;
  }): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO crm_training_registrations
        (company_name, industry_id, industry, main_product, export_experience, certification, contact_name, position, telephone, email, remark, created_at, ip, audit_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, 'pending')`,
      [
        data.companyName, data.industryId, data.industry,
        data.mainProduct, data.exportExperience, data.certification,
        data.contactName, data.position, data.telephone,
        data.email, data.remark, data.ip,
      ],
    );
    return Number((result as RowDataPacket).insertId);
  }

  // ── P3-11 安全修复：下载计数持久化到 crm_training_download_stats ──

  /** 原子递增下载计数（INSERT ON DUPLICATE KEY UPDATE） */
  async incrementDownloadCount(materialId: string, fileName: string): Promise<number> {
    await this.pool.execute(
      `INSERT INTO crm_training_download_stats (material_id, file_name, download_count)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE download_count = download_count + 1, file_name = VALUES(file_name)`,
      [materialId, fileName],
    );
    const [rows] = await this.pool.execute(
      "SELECT download_count FROM crm_training_download_stats WHERE material_id = ? LIMIT 1",
      [materialId],
    );
    return Number((rows as RowDataPacket[])?.[0]?.download_count || 0);
  }

  /** 查询所有下载统计 */
  async listDownloadStats(): Promise<Record<string, number>> {
    const [rows] = await this.pool.query(
      "SELECT material_id, download_count FROM crm_training_download_stats ORDER BY download_count DESC",
    );
    const result: Record<string, number> = {};
    for (const row of rows as RowDataPacket[]) {
      result[row.material_id] = Number(row.download_count || 0);
    }
    return result;
  }
}

/** 系统配置（system 表） */
export class SystemRepo {
  constructor(private pool: Pool) {}

  /** 查询 ICP 备案号 */
  async getIcpBah(): Promise<string> {
    const [rows] = await this.pool.query(
      "SELECT bah FROM `system` LIMIT 1",
    );
    return (rows as RowDataPacket[])?.[0]?.bah || "";
  }
}
