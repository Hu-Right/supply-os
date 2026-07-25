/**
 * 展厅 API
 * Showroom API
 *
 * @module features/showroom/api
 * @description 展厅注册相关 API 调用
 *              Showroom registration related API calls
 */

import { api } from "@/core/http";
import type { Lead } from "@/types";

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
 *
 * 对齐原版：写入 CRM 线索池（`POST /api/leads`，type: exhibition_register），
 * 服务端无独立 showroom 端点。
 */
export const submitShowroomRegister = (data: ShowroomRegisterForm) =>
  api<Lead>("/api/leads", {
    method: "POST",
    body: {
      companyName: data.companyName,
      country: data.country,
      city: data.city,
      contactPerson: data.contactPerson,
      contactMethod: data.contactMethod,
      email: data.email,
      industry: data.industry,
      mainProducts: data.mainProducts,
      has国际公共采购Participation: data.has国际公共采购Participation,
      notes: data.notes,
      type: "exhibition_register",
    } as unknown as BodyInit,
  });
