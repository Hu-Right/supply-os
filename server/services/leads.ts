/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 双轨制退役（轨道D）：createLeadsStore（JSON 种子内存数组）已删除，
 * 线索全量持久化至 MySQL（ungm_1v1_appointments）。
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
    has国际公共采购Participation: false,
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
