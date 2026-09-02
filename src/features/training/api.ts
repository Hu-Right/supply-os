/**
 * 培训注册 API
 * Training Registration API
 *
 * @module features/training/api
 * @description 培训注册相关 API 调用
 *              Training registration related API calls
 */

import { api } from "@/core/http";

// ── 落地页动态数据类型（与后端 GET /api/training/landing 对齐） ──

export interface LandingCourse {
  id: number;
  name_zh: string;
  name_en: string | null;
  description_zh: string | null;
  description_en: string | null;
  unit_price: number;
  currency: string;
  includes: string[];
}

export interface LandingSchedule {
  id: number;
  period_number: number;
  start_date: string | Date;
  city: string;
  format: string;
  status: string;
  capacity: number | null;
  enrolled_count: number;
}

export interface LandingInstructor {
  id: number;
  name_zh: string;
  name_en: string | null;
  roles: string[];
  title_zh: string;
  title_en: string | null;
  bio_zh: string;
  bio_en: string | null;
  avatar_path: string;
}

export interface LandingTeamMember {
  id: number;
  name_zh: string;
  name_en: string | null;
  title_zh: string | null;
  title_en: string | null;
  roles: string[];
  avatar_path: string;
}

export interface LandingGalleryCategory {
  id: number;
  name_zh: string;
  name_en: string | null;
  description_zh: string | null;
  description_en: string | null;
  images: { image_path: string }[];
}

export interface LandingDataResponse {
  course: LandingCourse | null;
  schedules: LandingSchedule[];
  instructors: { featured: LandingInstructor[]; team: LandingTeamMember[] };
  gallery: LandingGalleryCategory[];
}

export interface CreateTrainingOrderRequest {
  course_id: number;
  schedule_id?: number | null;
  registration_id?: number | null;
  qualification_id?: number | null;
  participant_count?: number;
  provider: "alipay" | "wechat";
  contact_name?: string;
  telephone?: string;
}

export interface TrainingOrderResponse {
  success: boolean;
  order_no: string;
  provider: string;
  amount: number;
  currency: string;
  qr_code: string | null;
  pay_url: string | null;
  status: string;
  expires_at: string;
}

export interface TrainingOrderStatusResponse {
  order_no: string;
  status: string;
  total_amount: number;
  paid_at: string | null;
}

export interface TrainingParticipant {
  participant_no: number;
  full_name: string;
  gender?: string | null;
  phone?: string | null;
  company_name?: string | null;
  position?: string | null;
  email?: string | null;
}

export interface SaveParticipantsResponse {
  success: boolean;
  message: string;
  order_no: string;
  participant_count: number;
}

export interface GetParticipantsResponse {
  success: boolean;
  order_no: string;
  participants: TrainingParticipant[];
  participant_count: number;
}

/**
 * 培训注册表单数据
 * Training Registration Form Data
 */
export interface TrainingRegisterForm {
  company_name: string;
  // 未选择行业时允许 null（服务端 industry_id || null）
  industry_id: number | null;
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
 * 提交培训注册
 * Submit Training Registration
 */
export const submitTrainingRegister = (data: TrainingRegisterForm) =>
  api<{ success: boolean; id?: number }>("/api/training/register", {
    method: "POST",
    body: data as unknown as BodyInit,
  });

/**
 * 获取落地页动态数据（课程/期次/讲师/团队/照片）
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
 * 保存学员信息（支付完成后）
 * Save participant information (after payment)
 */
export const saveTrainingParticipants = (orderNo: string, participants: TrainingParticipant[]) =>
  api<SaveParticipantsResponse>(`/api/training/orders/${encodeURIComponent(orderNo)}/participants`, {
    method: "POST",
    body: JSON.stringify({ participants }) as unknown as BodyInit,
  });

/**
 * 查询学员信息
 * Get participant information
 */
export const fetchTrainingParticipants = (orderNo: string) =>
  api<GetParticipantsResponse>(`/api/training/orders/${encodeURIComponent(orderNo)}/participants`);
