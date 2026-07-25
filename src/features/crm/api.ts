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
