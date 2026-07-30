/**
 * 培训注册 API
 * Training Registration API
 *
 * @module features/training/api
 * @description 培训注册相关 API 调用
 *              Training registration related API calls
 */

import { api } from "@/core/http";

/**
 * 字典项类型
 * Dictionary Item Type
 */
export interface DictionaryItem {
  id: number;
  code?: string;
  title_zh?: string;
  title_en?: string;
  name?: string;
}

/**
 * 培训注册表单数据
 * Training Registration Form Data
 */
export interface TrainingRegisterForm {
  company_name: string;
  industry_id: number;
  main_product: string;
  export_experience: string;
  certification: string;
  contact_name: string;
  position: string;
  telephone: string;
  email: string;
  remark: string;
}

/**
 * 获取认证列表
 * Fetch Certifications List
 */
export const fetchCertifications = () => api<DictionaryItem[]>("/api/certifications");

/**
 * 获取 UNSPSC 行业列表
 * Fetch UNSPSC Industries List
 */
export const fetchIndustries = () => api<DictionaryItem[]>("/api/unspsc/industries");

/**
 * 获取子行业列表
 * Fetch Sub-industries List
 */
export const fetchSubIndustries = (parentId: string | number) =>
  api<DictionaryItem[]>(`/api/unspsc/children?parent_id=${encodeURIComponent(parentId)}`);

/**
 * 提交培训注册
 * Submit Training Registration
 */
export const submitTrainingRegister = (data: TrainingRegisterForm) =>
  api<{ success: boolean }>("/api/training/register", {
    method: "POST",
    body: data,
  });
