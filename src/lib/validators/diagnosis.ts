/**
 * 诊断 v2 提交体校验
 * Diagnosis (v2) payload validation
 *
 * @module lib/validators/diagnosis
 * @description 校验规则**从 DIAGNOSIS_FIELDS 派生**：v1 在路由里手写了一份 `required` 清单，
 *              三个入口各抄一遍且已经漂移，这里加题/删题只改常量，校验自动跟上。
 *              失败原因用判别联合（reason 枚举）返回，不靠"中文提示串里有没有某个词"判错——
 *              那种写法会把合法答案误判成错误。
 */
import { DIAGNOSIS_FIELDS, type DiagnosisFieldDef } from "@/shared/constants/diagnosis-dimensions";
import type { DiagnosisAnswers } from "@/lib/services/scoring/diagnosis-v2";

export const COMPANY_NAME_MAX = 255;
export const TEXT_FIELD_MAX = 500;

/** missing=未作答 / invalid=不在选项内 / too_long=超长 */
export type FieldRejectReason = "missing" | "invalid" | "too_long";

export interface DiagnosisPayload {
  companyName: string;
  /** 前端已确认主体时携带；为空则由服务端按公司名命中或建档 */
  supplierId: number | null;
  answers: DiagnosisAnswers;
}

export type ParseResult =
  | { ok: true; payload: DiagnosisPayload }
  | { ok: false; fieldKey: string; reason: FieldRejectReason };

type FieldResult =
  | { ok: true; value: string | string[] }
  | { ok: false; reason: FieldRejectReason };

function validateField(field: DiagnosisFieldDef, raw: unknown): FieldResult {
  if (field.kind === "multi") {
    const list = Array.isArray(raw)
      ? raw.map((x) => String(x).trim()).filter(Boolean)
      : String(raw ?? "").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    // 空数组合法：语义是"一份都拿不出来"，评分自然落 0 档
    if (list.some((x) => !field.options!.includes(x))) return { ok: false, reason: "invalid" };
    return { ok: true, value: list };
  }

  const v = typeof raw === "string" ? raw.trim() : "";

  if (field.kind === "text") {
    if (v.length > TEXT_FIELD_MAX) return { ok: false, reason: "too_long" };
    return { ok: true, value: v };
  }

  if (!v) return { ok: false, reason: "missing" };
  if (!field.options!.includes(v)) return { ok: false, reason: "invalid" };
  return { ok: true, value: v };
}

export function parseDiagnosisPayload(body: Record<string, unknown>): ParseResult {
  const companyName = String(body.companyName ?? body.company_name ?? "").trim().slice(0, COMPANY_NAME_MAX);
  if (!companyName) return { ok: false, fieldKey: "company_name", reason: "missing" };

  const rawId = Number(body.supplierId ?? body.supplier_id ?? 0);
  const supplierId = Number.isFinite(rawId) && rawId > 0 ? Math.trunc(rawId) : null;

  const answers: DiagnosisAnswers = {};
  // 答案一律嵌在 `body.answers` 里，与 shared/api/diagnosis 的 submitDiagnosis 请求体同形。
  // 刻意**不做**「兼容扁平」的 `body.answers ?? body` 兜底：两套形状同时合法会把这次
  // 前后端漂移再藏一次——单测按扁平构造、真实前端按嵌套发送，两边都绿而线上一提交就 400。
  const rawAnswers = body.answers;
  if (typeof rawAnswers !== "object" || rawAnswers === null || Array.isArray(rawAnswers)) {
    return { ok: false, fieldKey: "answers", reason: "missing" };
  }
  const bag = rawAnswers as Record<string, unknown>;
  for (const field of DIAGNOSIS_FIELDS) {
    const result = validateField(field, bag[field.key]);
    if (!result.ok) return { ok: false, fieldKey: field.key, reason: result.reason };
    answers[field.key] = result.value;
  }

  return { ok: true, payload: { companyName, supplierId, answers } };
}
