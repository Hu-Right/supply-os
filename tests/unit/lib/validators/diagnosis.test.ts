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
import { DIAGNOSIS_V3_FORM_FIELDS } from "@/shared/constants/diagnosis-v3";

/** 请求体根层只认这几个信封字段，其余 overrides 均视为答案字段（归入 answers） */
const TOP_LEVEL = new Set(["companyName", "company_name", "supplierId", "supplier_id"]);

function validBody(overrides: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {};
  for (const f of DIAGNOSIS_V3_FORM_FIELDS) {
    answers[f.key] = f.kind === "multi" ? [...(f.options ?? [])].slice(0, 2) : f.options![1];
  }
  answers.target_markets = ["EU"];
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
    if (r.ok) expect(r.payload.answers.cost_pricing).toBeTruthy();
  });

  it("rejects a missing required target market", () => {
    const body = validBody();
    body.answers.target_markets = [];
    const r = parseDiagnosisPayload(body);
    expect(r).toMatchObject({ ok: false, fieldKey: "target_markets", reason: "missing" });
  });

  it("allows an unanswered capability question (选答)", () => {
    const capBody = validBody();
    capBody.answers.technical_response = "";
    const r = parseDiagnosisPayload(capBody);
    expect(r.ok).toBe(true);
  });

  it("rejects an out-of-range option instead of silently scoring it", () => {
    const r = parseDiagnosisPayload(validBody({ cost_pricing: "报价算到分" }));
    expect(r).toMatchObject({ ok: false, fieldKey: "cost_pricing", reason: "invalid" });
  });

  it("allows an empty multi-select (means: cannot provide any of them)", () => {
    const r = parseDiagnosisPayload(validBody({ supply_assurance: [] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.answers.supply_assurance).toEqual([]);
  });

  it("rejects unknown items inside a multi-select", () => {
    const r = parseDiagnosisPayload(validBody({ target_channels: ["欧盟 TED / ESPD", "皇家万能体系"] }));
    expect(r).toMatchObject({ ok: false, fieldKey: "target_channels", reason: "invalid" });
  });


  it("requires a company name before anything else", () => {
    const r = parseDiagnosisPayload(validBody({ companyName: "   " }));
    expect(r).toMatchObject({ ok: false, fieldKey: "company_name", reason: "missing" });
  });

  it("rejects a FLAT body instead of silently accepting a second wire shape", () => {
    const flat: Record<string, unknown> = { companyName: "浙江某某科技有限公司" };
    for (const f of DIAGNOSIS_V3_FORM_FIELDS) {
      flat[f.key] = f.kind === "multi" ? [] : f.options![1];
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
