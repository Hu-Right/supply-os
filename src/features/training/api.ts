/**
 * 培训注册 API
 * Training Registration API
 *
 * @module features/training/api
 * @description 培训注册相关 API 调用
 *              Training registration related API calls
 */

import { api, apiCached } from "@/core/http";
import type { IndustryTreeOption } from "@/types";

// ── 落地页动态数据类型（与后端 GET /api/training/landing 对齐，红线② camelCase）──
// 说明：落地页仅课程与期次走动态数据（支撑报名支付链路）；
//       同域的**请求体**（CreateTrainingOrderRequest 等）仍用 snake 列名口径，
//       红线②只约束响应实体字段。
//       讲师/团队/课堂照片与全部文案均为前端静态配置 + i18n。

export interface LandingCourse {
  id: number;
  nameZh: string;
  nameEn: string | null;
  descriptionZh: string | null;
  descriptionEn: string | null;
  unitPrice: number;
  currency: string;
  includes: string[];
}

export interface LandingSchedule {
  id: number;
  periodNumber: number;
  startDate: string | Date;
  city: string;
  format: string;
  status: string;
  capacity: number | null;
  enrolledCount: number;
}

export interface LandingDataResponse {
  course: LandingCourse | null;
  schedules: LandingSchedule[];
}

export interface CreateTrainingOrderRequest {
  course_id: number;
  schedule_id?: number | null;
  /** 本单覆盖的报名行 id（报名接口返回的 ids）；人数与期次由服务端按行校验，不传 count */
  registration_ids?: number[];
  provider: "alipay" | "wechat";
  contact_name?: string;
  telephone?: string;
}

/** 建单响应体（服务端 TrainingOrderResult 的镜像，红线② camelCase） */
export interface TrainingOrderResponse {
  success: boolean;
  orderNo: string;
  provider: string;
  amount: number;
  currency: string;
  qrCodeUrl: string | null;
  payUrl: string | null;
  status: string;
  expiresAt: string;
}

/** 查单响应体（金额键与会员/学习/服务三个分支一致用 amount） */
export interface TrainingOrderStatusResponse {
  orderNo: string;
  status: string;
  amount: number;
  paidAt: string | null;
}

/**
 * 学员（GET 响应视图，红线② camelCase）。
 * `email` 是真实列（baseline:2298 / 线上库 varchar(200)）：旧注释“表里没这一列”已于
 * 2026-10-29 用只读探针推翻——列一直在，只是写入链路没写它（已补齐）。
 */
export interface TrainingParticipant {
  participantNo: number;
  fullName: string;
  gender?: string | null;
  phone?: string | null;
  companyName?: string | null;
  position?: string | null;
  email?: string | null;
}

/**
 * 学员录入/提交体（表单状态与报名请求体）。
 * 2026-11-13 收敛：一行 = 一位学员，键沿用 training_enrollments 列名
 * （请求侧允许 snake，红线②只约束响应实体字段）；participant_no 由服务端按下标重排，
 * 客户端传的值只用于表单内排序。
 */
export interface ParticipantInput {
  participant_no: number;
  full_name: string;
  gender?: string | null;
  phone?: string | null;
  position?: string | null;
  email?: string | null;
}

export interface GetParticipantsResponse {
  success: boolean;
  orderNo: string;
  participants: TrainingParticipant[];
  participantCount: number;
}

/**
 * 报名提交体（POST /api/training/register）。
 *
 * 2026-11-13 收敛：一次请求写全所有参训学员（一行一人），不再有「支付成功后再补名单」。
 * 企业信息与期次是同一批报名的快照，服务端会写到每一行。
 * 请求侧仍用列名口径（红线②只约束响应实体字段）。
 */
export interface TrainingRegisterPayload {
  company_name: string;
  main_product: string;
  export_experience: string;
  certification: string;
  remark: string;
  /** 发票/开课通知邮箱（企业区）；与 participants[].email（学员个人）分开存 */
  email: string;
  /** 参训期次：报名必选 */
  schedule_id: number;
  participants: ParticipantInput[];
}

/** 报名响应：ids 按提交顺序对应每位学员，下单时回传 */
export interface TrainingRegisterResponse {
  success: boolean;
  id: number | null;
  ids: number[];
  count: number;
}

/** 认证资质参考项（GET /api/certifications）：服务端只发 id + name 两键。
 *  2026-10-28 删掉 `title_zh` / `title_en`：`supplier_certifications` 表从来没这两列
 *  （列只有 id / name / sort_order / is_active / created_at），端点也只 SELECT id, name，
 *  所以它们是幻影字段；两处读取点靠它们做的回退链一并拆掉。 */
export interface CertificationRefItem {
  id: number;
  /** 认证编码（ISO9001 / CE / PCAB）：2026-11-13 起随字典规范化透出，供选择后存 code 快照 */
  code: string;
  name: string;
  /** 性质（management / industry / market_access / product_safety / esg）：下拉分组用 */
  category: string;
}

/** 资质证书参考项（与旧品类字典无关，独立端点） */
export const fetchCertifications = () => api<CertificationRefItem[]>("/api/certifications");

/** 行业级联第一级（门类，UGT-I 行业面）：与供应商页同一取数口 */
export const fetchIndustryFacets = () => apiCached<IndustryTreeOption[]>("/api/industries/facets");

/** 行业级联第 2~4 级选项（key = 行业节点码） */
export const fetchIndustryChildren = (parent: string) =>
  apiCached<IndustryTreeOption[]>(`/api/industries/tree?parent=${encodeURIComponent(parent)}`);

/**
 * 提交培训报名（一次写全 N 位学员）
 * Submit training registration — all participants in one request.
 */
export const submitTrainingRegister = (data: TrainingRegisterPayload) =>
  api<TrainingRegisterResponse>("/api/training/register", {
    method: "POST",
    body: data as unknown as BodyInit,
  });

/**
 * 获取落地页动态数据（课程/期次）
 * Fetch landing page dynamic data
 */
export const fetchLandingData = () => api<LandingDataResponse>("/api/training/landing");

/**
 * 创建培训支付订单
 * Create training payment order
 */
export const createTrainingOrder = (data: CreateTrainingOrderRequest) =>
  api<TrainingOrderResponse>("/api/training/orders", {
    method: "POST",
    body: data as unknown as BodyInit,
  });

/**
 * 查询培训订单状态
 * Query training order status
 */
export const fetchTrainingOrderStatus = (orderNo: string) =>
  api<TrainingOrderStatusResponse>(`/api/training/orders/${encodeURIComponent(orderNo)}`);

/**
 * 模拟培训订单支付成功（仅 mock 模式）
 * Mock training order payment (mock mode only)
 */
export const mockPayTrainingOrder = (orderNo: string) =>
  api<{ success: boolean; status: string }>(`/api/training/orders/${encodeURIComponent(orderNo)}/mock-paid`, {
    method: "POST",
    body: {},
  });

/**
 * 查询学员信息（GET 保留：订单归属人回显自己提交的名单）
 * Get participant information
 */
export const fetchTrainingParticipants = (orderNo: string) =>
  api<GetParticipantsResponse>(`/api/training/orders/${encodeURIComponent(orderNo)}/participants`);
