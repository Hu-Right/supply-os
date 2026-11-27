/**
 * 诊断计算后台客户端（门户 → intelligence-daily）
 *
 * @module lib/services/supplier-diagnosis/backend-client
 * @description 2026-11-27 口径：门户负责评分（V5 + 资质分级），提交时把作答与评分快照
 *              一起送后台；后台只消费快照生成报告并落库，不重新打分。
 *              本文件是门户唯一的后台调用点，不做本地兜底评分。
 */
import type {
  DiagnosisAnswers,
  DiagnosisDimensionResult,
  DiagnosisQualBreakdown,
} from "@/shared/api/diagnosis";
import type { DiagnosisScoreSnapshot } from "./score-submission";

export interface BackendDiagnosisResult {
  id: number;
  schemaVersion: number;
  scoreTotal: number | null;
  scoreGrade: string | null;
  gradeBeforeCaps?: string;
  gradeLabel: string;
  dimensions: DiagnosisDimensionResult[];
  partScores?: Array<{ code: "A" | "B" | "C"; name: string; score: number; max: number }>;
  caps?: Array<{ reason: string; cap: string }>;
  topGaps: { dimension: string; dimensionEn: string; priority: string }[];
  overrideGate: { triggered: boolean; reason: string };
  qualGrade: string | null;
  qualBreakdown: DiagnosisQualBreakdown;
}

export interface BackendDiagnosisPayload {
  userId: number;
  supplierId: number;
  companyName: string;
  answers: DiagnosisAnswers;
  /** 门户算好的评分快照；后台原样落库并出报告，不重算 */
  score: DiagnosisScoreSnapshot;
  ip: string | null;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function backendConfig(): { baseUrl: string; token: string } {
  const baseUrl = String(process.env.INTELLIGENCE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const token = String(process.env.DIAGNOSIS_INTERNAL_TOKEN ?? "").trim();
  if (!baseUrl || !token) {
    throw new Error("DIAGNOSIS_BACKEND_NOT_CONFIGURED");
  }
  return { baseUrl, token };
}

/** 提交作答到后台，返回后台算好的评分与资质分级快照 */
export async function submitDiagnosisToBackend(
  payload: BackendDiagnosisPayload,
): Promise<BackendDiagnosisResult> {
  const { baseUrl, token } = backendConfig();
  const res = await fetch(`${baseUrl}/api/v1/internal/diagnosis/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": token,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DIAGNOSIS_BACKEND_${res.status}:${detail.slice(0, 200)}`);
  }
  return (await res.json()) as BackendDiagnosisResult;
}
