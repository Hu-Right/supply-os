/**
 * 诊断 v2 前端接口层
 * Diagnosis (v2) API client
 *
 * @module shared/api/diagnosis
 * @description 三个端点均返回**裸载荷**（2026-10 去 {code:0,message,data} 信封迁移），
 *              本层直接把裸载荷本体交给调用方；出口只一处读字段，避免前端读错层。
 */
import { api } from "@/core/http";

/** 相似公司候选（已脱敏：无联系人/电话/邮箱，信用代码为掩码） */
export interface DiagnosisCandidate {
  supplierId: number;
  company: string;
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
  supplierId: number;
  claimRequired: boolean;
  scoreTotal: number;
  scoreGrade: string;
  gradeLabel: string;
  dimensions: DiagnosisDimensionResult[];
  topGaps: { dimension: string; dimensionEn: string; priority: string }[];
  overrideGate: { triggered: boolean; reason: string };
}

export interface MyDiagnosis {
  id: number;
  supplierId: number;
  companyName: string;
  schemaVersion: number;
  scoreTotal: number | null;
  scoreGrade: string | null;
  submittedAt: string;
  answers: Record<string, string | string[]>;
}

/** key = 字段名（与 DIAGNOSIS_FIELDS 一致），单选/文本为 string，多选为 string[] */
export type DiagnosisAnswers = Record<string, string | string[]>;

export function findSimilarCompanies(company: string): Promise<DiagnosisCandidate[]> {
  const url = `/api/suppliers/similar?company=${encodeURIComponent(company.trim())}`;
  return api<{ list: DiagnosisCandidate[] }>(url).then((res) => res?.list ?? []);
}

export function submitDiagnosis(payload: {
  companyName: string;
  supplierId: number | null;
  answers: DiagnosisAnswers;
}): Promise<DiagnosisSubmitResult> {
  return api<DiagnosisSubmitResult>("/api/supplier-diagnosis", {
    method: "POST",
    body: payload as unknown as BodyInit,
  });
}

export function fetchMyDiagnoses(): Promise<MyDiagnosis[]> {
  return api<{ list: MyDiagnosis[] }>("/api/supplier-diagnosis/mine").then(
    (res) => res?.list ?? [],
  );
}
