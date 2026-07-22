/**
 * 展厅 API
 * Showroom API
 *
 * @module features/showroom/api
 * @description 展厅注册相关 API 调用
 *              Showroom registration related API calls
 */

import { api } from "@/core/http";

/**
 * 展厅注册表单数据
 * Showroom Registration Form Data
 */
export interface ShowroomRegisterForm {
  companyName: string;
  country: string;
  city: string;
  contactPerson: string;
  contactMethod: string;
  email: string;
  industry: string;
  mainProducts: string;
  has国际公共采购Participation: boolean;
  notes: string;
}

/**
 * 提交展厅注册
 * Submit Showroom Registration
 */
export const submitShowroomRegister = (data: ShowroomRegisterForm) =>
  api<{ success: boolean }>("/api/showroom/register", {
    method: "POST",
    body: data as unknown as BodyInit,
  });
