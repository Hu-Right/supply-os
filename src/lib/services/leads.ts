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

import type { LeadsRepo } from "../repos/leads.repo";
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

/**
 * 创建预约/线索（Lead 领域模型 → 表列映射 + 默认值；SQL 写入经 LeadsRepo 唯一端口）。
 * N6 收敛（2026-08-20）：原函数内裸 SQL 已下沉 LeadsRepo.insertAppointment。
 */
export async function insertUngmAppointment(leadsRepo: LeadsRepo, lead: Lead, rawPayload: any, ip: string) {
  await leadsRepo.insertAppointment({
    appointmentKey: lead.id,
    companyName: lead.companyName,
    country: lead.country || "China",
    city: lead.city || "Unknown",
    contactPerson: lead.contactPerson,
    contactMethod: lead.contactMethod,
    email: lead.email || "",
    industry: lead.industry || "Services",
    consultationNeeds: lead.notes || "",
    status: lead.status || "new",
    followUpLogs: JSON.stringify(lead.followUpLogs || []),
    extra: JSON.stringify({ source: "consult_form", lead_type: "consulting_advisor" }),
    rawPayload: JSON.stringify(rawPayload || {}),
    ip,
    createdAt: new Date(lead.createdAt),
  });
}
