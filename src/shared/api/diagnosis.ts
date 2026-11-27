/**
 * 诊断 v2 前端接口层
 * Diagnosis (v2) API client
 *
 * @module shared/api/diagnosis
 * @description 三个端点均返回**裸载荷**（2026-10 去 {code:0,message,data} 信封迁移），
 *              本层直接把裸载荷本体交给调用方；出口只一处读字段，避免前端读错层。
 */
import { api } from "@/core/http";
import type { BidGateResult } from "@/shared/constants/diagnosis-bid-gate";

/** 相似公司候选（已脱敏：无联系人/电话/邮箱，信用代码为掩码） */
export interface DiagnosisCandidate {
  supplierId: number;
  company: string;
  province: string;
  city: string;
  establishedAt: string;
  legalRep: string;
  creditCodeMasked: string;
  verified: boolean;
  claimPending: boolean;
  /** 已被其他用户/账户绑定（存在 users 关联记录且非当前用户）；弹窗据此提示「该公司已被绑定」 */
  bound: boolean;
  /** 绑定在当前用户名下（自己的主体）：即使已认证也可诊断（2026-11-11 一司一份口径） */
  mine: boolean;
}

export interface DiagnosisDimensionResult {
  no: number;
  /** V5：所属部分 A 资质 / B 能力 / C 档案 */
  part?: "A" | "B" | "C";
  name: string;
  nameEn: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  evidenceSource: string;
  scoringBasis: string;
  needsManualReview: boolean;
}

export interface DiagnosisPartScore {
  code: "A" | "B" | "C";
  name: string;
  score: number;
  max: number;
}

export interface DiagnosisGradeCap {
  reason: string;
  cap: string;
}

export interface DiagnosisSubmitResult {
  id: number;
  supplierId: number;
  /** 无主主体上的路人诊断（闸口放行且非归属人）：结果页据此提示「如为贵公司可发起认领」 */
  subjectUnclaimed: boolean;
  /** V5 统一评分：未答按 0 分，仍出总分（报告标「未提供」） */
  scoreTotal: number | null;
  scoreGrade: string | null;
  /** 红线封顶前的等级（V5） */
  gradeBeforeCaps?: string;
  gradeLabel: string;
  dimensions: DiagnosisDimensionResult[];
  /** V5 三部分得分：A 资质 / B 能力 / C 档案 */
  partScores?: DiagnosisPartScore[];
  /** V5 红线封顶原因 */
  caps?: DiagnosisGradeCap[];
  /**
   * A 段合格制闸门：能不能进投标名单。
   * 与 scoreTotal 互不换算——出局时总分再高也不改变结论。
   * 历史快照/后台未透出时缺省，前端按「未提供」处理。
   */
  bidGate?: BidGateResult;
  topGaps: { dimension: string; dimensionEn: string; priority: string }[];
  overrideGate: { triggered: boolean; reason: string };
  /** V3 口径代次（2=投标能力诊断，3=资质完善诊断；历史代次不互比） */
  schemaVersion: number;
  /** V3 资质分级：null = 未分级（未填目标市场 / 字典不可用，原因见 qualBreakdown.unscoredReason） */
  qualGrade: string | null;
  qualBreakdown: DiagnosisQualBreakdown | null;
}

/** V3 资质缺口明细（逐市场应备清单 + 已持/缺失；报告侧消费，表单不展开） */
export interface DiagnosisQualMarketGap {
  market: string;
  required: { code: string; name: string; held: boolean }[];
  missing: string[];
}

export interface DiagnosisQualBreakdown {
  targetMarkets: string[];
  markets: DiagnosisQualMarketGap[];
  requiredCodes: string[];
  heldCodes: string[];
  missingCodes: string[];
  missingCount: number;
  noRequirementMarkets: string[];
  unscoredReason: "no_target_markets" | "dict_unavailable" | null;
  /** V3：要求条目两栏（存在时等级以 legal 缺口为准） */
  requirements?: {
    legal: DiagnosisQualRequirementHit[];
    green: DiagnosisQualRequirementHit[];
    legalMissingCount: number;
  };
  /** 供应商主营范围可读标签 */
  scopeLabels?: string[];
}

/** V3：要求条目的命中结果（法定 / 评分 / 自愿） */
export interface DiagnosisQualRequirementHit {
  market: string;
  kind: "legal" | "scoring" | "voluntary";
  standard: string;
  name: string;
  held: boolean;
  status?: "met" | "missing" | "unknown";
  evidence: string;
  remediation: string;
  leadTimeDays: number | null;
  source: string;
}

export interface MyDiagnosis {
  id: number;
  supplierId: number;
  companyName: string;
  schemaVersion: number;
  scoreTotal: number | null;
  scoreGrade: string | null;
  /** V3 资质分级（历史 V2 行为 null） */
  qualGrade?: string | null;
  qualBreakdown?: DiagnosisQualBreakdown | null;
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
