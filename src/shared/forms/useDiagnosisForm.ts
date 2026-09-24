/**
 * 诊断 v2 表单状态机（三个入口共用的唯一提交器）
 * Diagnosis (v2) form state machine — the single submitter shared by all entries
 *
 * @module shared/forms/useDiagnosisForm
 * @description v1 的三个入口各抄了一份 12 条 if 校验和一份 14 键 label 映射，且已经漂移
 *              （两处把选填官网留空写成字面量 "https://"）。这里只留一份状态机：
 *              题目与必填规则全部来自 DIAGNOSIS_FIELDS 常量，加题删题不改本文件。
 *              客户端校验只是体验（少一次往返），**权威校验在服务端 validators/diagnosis.ts**。
 */
import { useCallback, useMemo, useState } from "react";
import { DIAGNOSIS_FIELDS } from "@/shared/constants/diagnosis-dimensions";
import {
  findSimilarCompanies,
  submitDiagnosis,
  type DiagnosisAnswers,
  type DiagnosisCandidate,
  type DiagnosisSubmitResult,
} from "@/shared/api/diagnosis";
import { ApiError } from "@/core/http";
import { usePersistedFormState } from "@/shared/hooks/usePersistedFormState";

export interface DiagnosisFormState {
  company: string;
  /** 已确认的主体；null 表示"未命中，提交时由服务端建档" */
  supplierId: number | null;
  answers: DiagnosisAnswers;
}

function emptyAnswers(): DiagnosisAnswers {
  const answers: DiagnosisAnswers = {};
  for (const field of DIAGNOSIS_FIELDS) {
    answers[field.key] = field.kind === "multi" ? [] : "";
  }
  return answers;
}

export const INITIAL_DIAGNOSIS_FORM: DiagnosisFormState = {
  company: "",
  supplierId: null,
  answers: emptyAnswers(),
};

/** 错误要么是 i18n 键（本地可判定的），要么是服务端返回的中文提示 */
export interface DiagnosisFormError {
  i18nKey?: string;
  message?: string;
  /** 未作答的单选题 key，供组件定位到具体题目 */
  missing?: string[];
}

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function useDiagnosisForm() {
  const [form, setForm, clearDraft] = usePersistedFormState<DiagnosisFormState>(
    "draft:supplier_diagnosis",
    INITIAL_DIAGNOSIS_FORM,
    { ttlMs: DRAFT_TTL_MS },
  );

  const [candidates, setCandidates] = useState<DiagnosisCandidate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [noMatch, setNoMatch] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<DiagnosisFormError | null>(null);
  const [result, setResult] = useState<DiagnosisSubmitResult | null>(null);

  const setAnswer = useCallback(
    (key: string, value: string) =>
      setForm((prev) => ({ ...prev, answers: { ...prev.answers, [key]: value } })),
    [setForm],
  );

  const toggleMulti = useCallback(
    (key: string, value: string) =>
      setForm((prev) => {
        const current = (prev.answers[key] as string[]) ?? [];
        const next = current.includes(value) ? current.filter((x) => x !== value) : [...current, value];
        return { ...prev, answers: { ...prev.answers, [key]: next } };
      }),
    [setForm],
  );

  /** 主体未确认前，公司名一旦改动就作废旧候选，避免"看着 A 的档案、提交成 B 的主体" */
  const setCompany = useCallback(
    (value: string) => {
      setForm((prev) => ({ ...prev, company: value, supplierId: null }));
      setCandidates([]);
      setNoMatch(false);
    },
    [setForm],
  );

  const checkCompany = useCallback(async () => {
    const name = form.company.trim();
    if (name.length < 2) {
      setError({ i18nKey: "diagErrCompanyTooShort" });
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const list = await findSimilarCompanies(name);
      if (list.length === 0) {
        setNoMatch(true);
        setDialogOpen(false);
      } else {
        setCandidates(list);
        setDialogOpen(true);
      }
    } catch (err) {
      setError({ message: err instanceof ApiError && err.message ? err.message : "network" , i18nKey: err instanceof ApiError && err.message ? undefined : "diagErrorNetwork" });
    } finally {
      setChecking(false);
    }
  }, [form.company]);

  const confirmCandidate = useCallback(
    (candidate: DiagnosisCandidate) => {
      setForm((prev) => ({ ...prev, company: candidate.company, supplierId: candidate.supplierId }));
      setNoMatch(false);
      setDialogOpen(false);
    },
    [setForm],
  );

  /** "不是我的公司"：不锁主体，按新建档案走，用户可继续改公司名重填 */
  const declareNotMine = useCallback(() => {
    setForm((prev) => ({ ...prev, supplierId: null }));
    setCandidates([]);
    setNoMatch(true);
    setDialogOpen(false);
  }, [setForm]);

  /** 客户端预检：只查单选题（多选题空选合法，语义是"一份都拿不出"） */
  const missingRequired = useMemo(
    () =>
      DIAGNOSIS_FIELDS.filter(
        (f) => f.kind === "single" && !String(form.answers[f.key] ?? "").trim(),
      ).map((f) => f.key),
    [form.answers],
  );

  const submit = useCallback(async () => {
    if (form.company.trim().length < 2) {
      setError({ i18nKey: "diagErrCompanyTooShort" });
      return;
    }
    if (missingRequired.length > 0) {
      setError({ i18nKey: "diagErrMissingAnswers", missing: missingRequired });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = await submitDiagnosis({
        companyName: form.company.trim(),
        supplierId: form.supplierId,
        answers: form.answers,
      });
      setResult(data);
      clearDraft();
      return data;
    } catch (err) {
      setError({
        message: err instanceof ApiError && err.message ? err.message : "",
        i18nKey: err instanceof ApiError && err.message ? undefined : "diagErrorNetwork",
      });
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [form.answers, form.company, form.supplierId, missingRequired, clearDraft]);

  /** 载入已有诊断做修改（规范 N5：改的是同一条，不是再建一条） */
  const loadForEdit = useCallback(
    (payload: { company: string; supplierId: number; answers: DiagnosisAnswers }) => {
      setForm({ company: payload.company, supplierId: payload.supplierId, answers: { ...emptyAnswers(), ...payload.answers } });
      setResult(null);
      setError(null);
      setNoMatch(false);
      setCandidates([]);
    },
    [setForm],
  );

  return {
    form,
    setCompany,
    setAnswer,
    toggleMulti,
    candidates,
    dialogOpen,
    noMatch,
    checking,
    submitting,
    error,
    result,
    missingRequired,
    checkCompany,
    confirmCandidate,
    declareNotMine,
    closeDialog: () => setDialogOpen(false),
    submit,
    loadForEdit,
    clearDraft,
    reset: () => { setForm(INITIAL_DIAGNOSIS_FORM); setResult(null); setError(null); setNoMatch(false); },
  };
}
