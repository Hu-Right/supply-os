/**
 * CRM 模块 API 层
 * CRM Module API Layer
 *
 * @module features/crm/api
 * @description 统一管理 CRM 模块的后端 API 调用
 *              Centralizes all backend API calls for the CRM module
 */

import { api } from "@/core/http";
import type { Lead } from "@/types";

/**
 * 获取线索列表
 * Fetch leads list
 */
export const fetchLeads = () => api<Lead[]>("/api/leads");

/**
 * 获取自定义供应商列表
 * Fetch custom suppliers list
 */
export const fetchCustomSuppliers = () => api<import("@/types").Supplier[]>("/api/suppliers/custom");

/**
 * 提交跟进日志
 * Submit follow-up log
 */
export const submitFollowUp = (leadId: string, log: { action: string; note: string }) =>
  fetch(`/api/leads/${leadId}/follow-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(log),
  }).then((res) => res.json() as Promise<{ success: boolean }>);
