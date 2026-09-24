/**
 * 诊断 v2 校验与脱敏单元测试
 *
 * @module tests/unit/lib/validators/diagnosis
 * @description 重点钉住三件容易写错的事：多选空数组必须合法（语义是"一份都拿不出"）、
 *              非法取值必须拒绝而不是静默给分、信用代码掩码不得回原文。
 */
import { describe, it, expect } from "vitest";
import { parseDiagnosisPayload } from "@/lib/validators/diagnosis";
import { maskCreditCode } from "@/lib/repos/suppliers/supplier-directory.repo";
import { DIAGNOSIS_FIELDS } from "@/shared/constants/diagnosis-dimensions";

/** 请求体根层只认这几个信封字段，其余 overrides 均视为答案字段（归入 answers） */
const TOP_LEVEL = new Set(["companyName", "company_name", "supplierId", "supplier_id"]);

function validBody(overrides: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {};
  for (const f of DIAGNOSIS_FIELDS) {
    answers[f.key] =
      f.kind === "multi" ? [...(f.options ?? [])].slice(0, 2) : f.kind === "text" ? "德国, 法国" : f.options![1];
  }
  const top: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (TOP_LEVEL.has(k)) top[k] = v;
    else answers[k] = v;
  }
  return { companyName: "浙江某某科技有限公司", ...top, answers };
}

describe("parseDiagnosisPayload", () => {
  it("accepts a complete payload and returns answers keyed by field", () => {
    const r = parseDiagnosisPayload(validBody());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.answers.export_scale).toBeTruthy();
  });

  it("rejects a missing required single-choice answer", () => {
    const r = parseDiagnosisPayload(validBody({ technical_response: "" }));
    expect(r).toMatchObject({ ok: false, fieldKey: "technical_response", reason: "missing" });
  });

  it("rejects an out-of-range option instead of silently scoring it", () => {
    const r = parseDiagnosisPayload(validBody({ ungm_status: "已注册十级" }));
    expect(r).toMatchObject({ ok: false, fieldKey: "ungm_status", reason: "invalid" });
  });

  it("allows an empty multi-select (means: cannot provide any of them)", () => {
    const r = parseDiagnosisPayload(validBody({ mandatory_docs: [] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.answers.mandatory_docs).toEqual([]);
  });

  it("rejects unknown items inside a multi-select", () => {
    const r = parseDiagnosisPayload(validBody({ mandatory_docs: ["ISO体系证书", "皇家万能证书"] }));
    expect(r).toMatchObject({ ok: false, fieldKey: "mandatory_docs", reason: "invalid" });
  });

  it("enforces length limit on free-text answers", () => {
    const r = parseDiagnosisPayload(validBody({ service_countries: "国".repeat(600) }));
    expect(r).toMatchObject({ ok: false, fieldKey: "service_countries", reason: "too_long" });
  });

  it("requires a company name before anything else", () => {
    const r = parseDiagnosisPayload(validBody({ companyName: "   " }));
    expect(r).toMatchObject({ ok: false, fieldKey: "company_name", reason: "missing" });
  });

  // 真实缺陷回归钉：校验器曾从请求体**根层**取 19 个答案，而前端发的是嵌套 `answers`，
  // 导致答齐了仍回 400「english_evidence_level 为必答题」。扁平与嵌套不得同时合法，
  // 否则这类漂移只会由下一轮真机提交暴露。
  it("rejects a FLAT body instead of silently accepting a second wire shape", () => {
    const flat: Record<string, unknown> = { companyName: "浙江某某科技有限公司" };
    for (const f of DIAGNOSIS_FIELDS) {
      flat[f.key] = f.kind === "multi" ? [] : f.kind === "text" ? "德国" : f.options![1];
    }
    const r = parseDiagnosisPayload(flat);
    expect(r).toMatchObject({ ok: false, fieldKey: "answers", reason: "missing" });
  });
});

describe("maskCreditCode", () => {
  it("keeps only head-4 and tail-4", () => {
    expect(maskCreditCode("91330000MA1234567X")).toBe("9133****567X");
  });
  it("fully masks short values and passes empty through", () => {
    expect(maskCreditCode("12345678")).toBe("****");
    expect(maskCreditCode(null)).toBe("");
    expect(maskCreditCode("   ")).toBe("");
  });
});
