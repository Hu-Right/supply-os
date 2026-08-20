/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 双轨制退役（轨道D）：createLeadsStore（JSON 种子内存数组）已删除，
 * 线索全量持久化至 MySQL（ungm_1v1_appointments）。
 *
 * D2 说明：follow_up_logs / extra / raw_payload 三列在迁移 001 中已定义为
 * MySQL JSON 类型（非 TEXT/VARCHAR），数据库层已具备 JSON 校验与原生查询能力。
 * 写入时 JSON.stringify 为 mysql2 execute() 的 JSON 列参数要求，
 * 读取时 safeJson 兼容 mysql2 text/binary 两种协议的返回形态。
 * 若未来 follow_up_logs 需要高频 SQL 级查询（如“统计跟进次数”），
 * 可提升为独立子表 crm_lead_follow_up_logs（见《深度技术分析报告》§D2）。
 */

import type { Pool } from "mysql2/promise";
import { Lead } from "../types/crm";
import { safeJson } from "../utils/json";

export function mapUngmAppointmentRow(row: any): Lead {
  return {
    id: row.appointment_key,
    companyName: row.company_name,
    country: row.country || "China",
    city: row.city || "Unknown",
    contactPerson: row.contact_person,
    contactMethod: row.contact_method,
    email: row.email || "",
    industry: row.industry || "Services",
    mainProducts: "",
    hasIntlProcurement: false,
    notes: row.consultation_needs || "",
    type: "consulting_advisor",
    status: row.status || "new",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    followUpLogs: safeJson(row.follow_up_logs),
  };
}

export async function insertUngmAppointment(dbPool: Pool, lead: Lead, rawPayload: any, ip: string) {
  await dbPool.execute(
    `INSERT INTO ungm_1v1_appointments
      (appointment_key, company_name, country, city, contact_person, contact_method, email, industry, consultation_needs, status, follow_up_logs, extra, raw_payload, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      lead.id,
      lead.companyName,
      lead.country || "China",
      lead.city || "Unknown",
      lead.contactPerson,
      lead.contactMethod,
      lead.email || "",
      lead.industry || "Services",
      lead.notes || "",
      lead.status || "new",
      JSON.stringify(lead.followUpLogs || []),
      JSON.stringify({ source: "consult_form", lead_type: "consulting_advisor" }),
      JSON.stringify(rawPayload || {}),
      ip,
      new Date(lead.createdAt),
    ]
  );
}
