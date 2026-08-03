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
