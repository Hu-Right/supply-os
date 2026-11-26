import { describe, it, expect } from "vitest";
import {
  DIAGNOSIS_V5_DIMENSIONS,
  DIAGNOSIS_V5_FIELD_MAP,
  DIAGNOSIS_V5_FORM_FIELDS,
  DIAGNOSIS_V5_INDICATORS,
  DIAGNOSIS_V5_PARTS,
  assertDiagnosisV5Intact,
  scoreDiagnosisV5Field,
} from "@/shared/constants/diagnosis-v5";

describe("diagnosis V5 constants", () => {
  it("passes structural self-check", () => {
    expect(() => assertDiagnosisV5Intact()).not.toThrow();
    expect(DIAGNOSIS_V5_PARTS.reduce((s, p) => s + p.weight, 0)).toBe(100);
    expect(DIAGNOSIS_V5_DIMENSIONS).toHaveLength(12);
    expect(DIAGNOSIS_V5_INDICATORS).toHaveLength(25);
    expect(DIAGNOSIS_V5_FORM_FIELDS).toHaveLength(23);
  });

  it("certificates are derived, not collected", () => {
    const certCoverage = DIAGNOSIS_V5_FIELD_MAP["cert_coverage"];
    expect(certCoverage.source).toBe("derived");
    expect(certCoverage.scored).toBe(true);
    expect(DIAGNOSIS_V5_FORM_FIELDS.some((f) => f.key === "cert_coverage")).toBe(false);
    expect(DIAGNOSIS_V5_FORM_FIELDS.some((f) => f.key === "cert_ledger")).toBe(false);
    expect(DIAGNOSIS_V5_FORM_FIELDS.some((f) => f.key === "cert_delivery")).toBe(false);
  });

  it("target market is a required, non-scored prerequisite", () => {
    const target = DIAGNOSIS_V5_FIELD_MAP["target_markets"];
    expect(target.required).toBe(true);
    expect(target.scored).toBe(false);
    expect(target.options).toHaveLength(27); // 2026-11-26：认证字典 150 条启用后市场码由 16 扩至 27
  });

  it("multi-select scores by option points, capped at 5", () => {
    const channels = DIAGNOSIS_V5_FIELD_MAP["target_channels"];
    expect(scoreDiagnosisV5Field(channels, [])).toBe(0);
    expect(scoreDiagnosisV5Field(channels, [...(channels.options ?? [])])).toBe(5);
  });

  it("single-choice scores follow the explicit scoreMap", () => {
    const pricing = DIAGNOSIS_V5_FIELD_MAP["cost_pricing"];
    expect(scoreDiagnosisV5Field(pricing, pricing.options![0])).toBe(0);
    expect(scoreDiagnosisV5Field(pricing, pricing.options![pricing.options!.length - 1])).toBe(5);
  });
});
