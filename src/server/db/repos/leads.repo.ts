/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 线索 / 1v1 预约数据访问层
 * Leads Repository
 *
 * @module repos/leads.repo
 */
import "server-only";
import type { Pool } from "mysql2/promise";

export interface AppointmentRow {
  appointment_key: string;
  company_name: string;
  country: string | null;
  city: string | null;
  contact_person: string | null;
  contact_method: string | null;
  email: string | null;
  industry: string | null;
  consultation_needs: string | null;
  status: string;
  follow_up_logs: string | null;
  created_at: Date;
}

export class LeadsRepo {
  constructor(private pool: Pool) {}

  /** 查询最近 200 条预约 */
  async listAppointments(): Promise<AppointmentRow[]> {
    const [rows] = await this.pool.query(
      `SELECT appointment_key, company_name, country, city, contact_person, contact_method, email, industry,
              consultation_needs, status, follow_up_logs, created_at
       FROM ungm_1v1_appointments
       ORDER BY created_at DESC, id DESC
       LIMIT 200`,
    );
    return rows as AppointmentRow[];
  }

  /** 按 appointment_key 查找单条预约 */
  async findByKey(appointmentKey: string): Promise<AppointmentRow | null> {
    const [rows] = await this.pool.query(
      `SELECT appointment_key, company_name, country, city, contact_person, contact_method, email, industry,
              consultation_needs, status, follow_up_logs, created_at
       FROM ungm_1v1_appointments
       WHERE appointment_key = ?
       LIMIT 1`,
      [appointmentKey],
    );
    return (rows as AppointmentRow[])[0] ?? null;
  }

  /** 更新跟进日志和状态 */
  async updateFollowUpLogs(appointmentKey: string, logs: string, status: string): Promise<void> {
    await this.pool.execute(
      "UPDATE ungm_1v1_appointments SET follow_up_logs = ?, status = ?, updated_at = NOW() WHERE appointment_key = ?",
      [logs, status, appointmentKey],
    );
  }

  /** 创建预约/线索（N6 收敛：原 services/leads.ts 内裸 SQL 下沉至此，写入唯一端口） */
  async insertAppointment(params: {
    appointmentKey: string;
    companyName: string;
    country: string;
    city: string;
    contactPerson: string;
    contactMethod: string;
    email: string;
    industry: string;
    consultationNeeds: string;
    status: string;
    followUpLogs: string;
    extra: string;
    rawPayload: string;
    ip: string;
    createdAt: Date;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO ungm_1v1_appointments
        (appointment_key, company_name, country, city, contact_person, contact_method, email, industry, consultation_needs, status, follow_up_logs, extra, raw_payload, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.appointmentKey,
        params.companyName,
        params.country,
        params.city,
        params.contactPerson,
        params.contactMethod,
        params.email,
        params.industry,
        params.consultationNeeds,
        params.status,
        params.followUpLogs,
        params.extra,
        params.rawPayload,
        params.ip,
        params.createdAt,
      ],
    );
  }
}
