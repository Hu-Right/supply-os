/**
 * 诊断 v2 前端接口层
 * Diagnosis (v2) API client
 *
 * @module shared/api/diagnosis
 * @description 三个新端点都是**信封响应**（`{ code, message, data }`），本层负责统一解包，
 *              调用方拿到的直接是 data 内容 —— 这正是 v1 供应商资源库踩过的坑
 *              （前端读顶层 res.list 恒空），这里在出口处一次性解决。
 */
import { api } from "@/core/http";

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

/** 相似公司候选（已脱敏：无联系人/电话/邮箱，信用代码为掩码） */
export interface DiagnosisCandidate {
  supplierId: number;
  company: string;
  englishName: string;
  province: string;
  city: string;
  establishedAt: string;
  legalRep: string;
  creditCodeMasked: string;
  businessType: string;
  verified: boolean;
  claimPending: boolean;
  /** 已被其他用户/账户绑定（存在 crm_users 关联记录且非当前用户）；弹窗据此提示「该公司已被绑定」 */
  bound: boolean;
}

export interface DiagnosisDimensionResult {
  no: number;
  name: string;
  nameEn: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  evidenceSource: string;
  scoringBasis: string;
  needsManualReview: boolean;
}

export interface DiagnosisSubmitResult {
  id: number;
  supplier_id: number;
  claim_required: boolean;
  score_total: number;
  score_grade: string;
  grade_label: string;
  dimensions: DiagnosisDimensionResult[];
  top_gaps: { dimension: string; dimensionEn: string; priority: string }[];
  override_gate: { triggered: boolean; reason: string };
}

export interface MyDiagnosis {
  id: number;
  supplier_id: number;
  company_name: string;
  audit_status: string;
  schema_version: number;
  score_total: number | null;
  score_grade: string | null;
  submitted_at: string;
  answers: Record<string, string | string[]>;
}

/** key = 字段名（与 DIAGNOSIS_FIELDS 一致），单选/文本为 string，多选为 string[] */
export type DiagnosisAnswers = Record<string, string | string[]>;

export function findSimilarCompanies(company: string): Promise<DiagnosisCandidate[]> {
  const url = `/api/suppliers/similar?company=${encodeURIComponent(company.trim())}`;
  return api<Envelope<{ list: DiagnosisCandidate[] }>>(url).then((res) => res?.data?.list ?? []);
}

export function submitDiagnosis(payload: {
  companyName: string;
  supplierId: number | null;
  answers: DiagnosisAnswers;
}): Promise<DiagnosisSubmitResult> {
  return api<Envelope<DiagnosisSubmitResult>>("/api/supplier-diagnosis", {
    method: "POST",
    body: payload as unknown as BodyInit,
  }).then((res) => res.data);
}

export function fetchMyDiagnoses(): Promise<MyDiagnosis[]> {
  return api<Envelope<{ list: MyDiagnosis[] }>>("/api/supplier-diagnosis/mine").then(
    (res) => res?.data?.list ?? [],
  );
}
