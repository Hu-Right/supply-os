/**
 * 诊断计算后台客户端（门户 → intelligence-daily）
 *
 * @module lib/services/supplier-diagnosis/backend-client
 * @description 2026-11-24 职责收口：门户只负责登录、主体确认、写权闸口与表单提交，
 *              能力评分、资质分级、缺口快照统一由后台计算并落库。
 *              本文件是门户唯一的后台调用点，不做任何本地兜底评分——后台不可用就明确失败，
 *              避免「前台算一套、后台算一套」的双口径。
 */
import type {
  DiagnosisAnswers,
  DiagnosisDimensionResult,
  DiagnosisQualBreakdown,
} from "@/shared/api/diagnosis";

export interface BackendDiagnosisResult {
  id: number;
  schemaVersion: number;
  scoreTotal: number | null;
  scoreGrade: string | null;
  gradeLabel: string;
  dimensions: DiagnosisDimensionResult[];
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
