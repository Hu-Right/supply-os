/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Lead } from "../types/crm";
import { safeJson } from "../utils/json";

/** 兼容 ESM (tsx dev) 和 CJS (esbuild 生产构建) 两种模块系统 */
function getCurrentDir(): string {
  if (typeof __dirname !== "undefined") return __dirname;
  return dirname(fileURLToPath(import.meta.url));
}

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

export async function insertUngmAppointment(dbPool: any, lead: Lead, rawPayload: any, ip: string) {
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

/**
 * 从 JSON 文件加载种子数据
 * In-memory persistent database for the live session
 */
export function createLeadsStore(): Lead[] {
  const seedPath = join(getCurrentDir(), "../data/leads-seed.json");
  try {
    const data = readFileSync(seedPath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.warn("[leads] 无法加载种子数据文件，使用空数组:", err);
    return [];
  }
}
