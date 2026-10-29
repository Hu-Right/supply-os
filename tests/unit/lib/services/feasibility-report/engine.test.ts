import { describe, it, expect } from "vitest";
import { evaluateFeasibilityReport } from "@/lib/services/feasibility-report/engine";
import { equivalentCertCodes, compareWithUnit, normalizeCertCode, toBaseUnit } from "@/lib/services/feasibility-report/knowledge";
import type {
  CapabilityItem,
  CapabilityValue,
  RequirementItem,
  RequirementType,
  RequirementValue,
  Importance,
} from "@/lib/services/feasibility-report/types";

const DEADLINE = "2026-12-31T00:00:00.000Z";
const TODAY = "2026-10-29T00:00:00.000Z";

let seq = 0;
function req(over: {
  type: RequirementType;
  importance?: Importance;
  title?: string;
  value?: RequirementValue | null;
}): RequirementItem {
  seq += 1;
  return {
    id: `req-${seq}`,
    noticePk: 1,
    seq,
    type: over.type,
    importance: over.importance ?? "mandatory",
    title: over.title ?? `${over.type} 要求`,
    value: over.value ?? {},
    rawText: `${over.type} raw text`,
    source: { kind: "notice_text", quote: "quote" },
  };
}

let capSeq = 0;
function cap(type: CapabilityItem["type"], value: CapabilityValue, evidence = true): CapabilityItem {
  capSeq += 1;
  return {
    id: `cap-${capSeq}`,
    enterpriseId: 1,
    type,
    name: `${type} 能力`,
    value,
    ...(evidence ? { evidenceRefs: [{ id: `ev-${capSeq}`, kind: "upload_file", ref: `upload_files:${capSeq}` }] } : {}),
  };
}

function evaluate(requirements: RequirementItem[], capabilities: CapabilityItem[]) {
  return evaluateFeasibilityReport({
    noticePk: 1,
    enterpriseId: 1,
    requirements,
    capabilities,
    context: { bidDeadline: DEADLINE, today: TODAY },
  });
}

describe("feasibility-report 引擎（验收 case C-001 ~ C-010）", () => {
  it("C-001 强制证书缺失 → no_go，缺口带证据要求", () => {
    const r = req({ type: "certification", value: { code: "ISO14001" } });
    const report = evaluate([r], [cap("certification", { kind: "certification", code: "ISO9001", validUntil: "2027-01-01" })]);
    expect(report.verdict.decision).toBe("no_go");
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].status).toBe("missing");
    expect(report.gaps[0].refs).toContain(r.id);
    expect(report.matrix[0].status).toBe("missing");
    expect(report.deterministic.rulesFailed).toBe(1);
  });

  it("C-002 证书过期 → no_go（expired）", () => {
    const r = req({ type: "certification", value: { code: "ISO14001" } });
    const report = evaluate([r], [cap("certification", { kind: "certification", code: "ISO14001", validUntil: "2020-01-01" })]);
    expect(report.verdict.decision).toBe("no_go");
    expect(report.matrix[0].status).toBe("expired");
    expect(report.gaps[0].ruleId).toBe("CERT-02");
  });

  it("C-003 业绩数量不足 → conditional（partial）", () => {
    const r = req({ type: "experience", value: { years: 3, count: 2, similarScope: "lighting" } });
    const report = evaluate([r], [cap("experience", { kind: "experience", count: 1, years: 4, scope: "lighting" })]);
    expect(report.verdict.decision).toBe("conditional");
    expect(report.gaps[0].status).toBe("partial");
  });

  it("C-004 财务营收低于门槛 → no_go", () => {
    const r = req({ type: "financial", value: { metric: "revenue", value: 5_000_000, year: 2024, currency: "CNY" } });
    const report = evaluate([r], [cap("financial", { kind: "financial", metric: "revenue", value: 2_000_000, year: 2024 })]);
    expect(report.verdict.decision).toBe("no_go");
    expect(report.gaps[0].status).toBe("missing");
  });

  it("C-005 本地代理要求但企业无 → no_go", () => {
    const r = req({ type: "localization", value: { requires: ["hasLocalAgent"] } });
    const report = evaluate([r], [cap("localization", { kind: "localization", hasLocalOffice: true, hasLocalAgent: false })]);
    expect(report.verdict.decision).toBe("no_go");
    expect(report.matrix[0].status).toBe("missing");
  });

  it("C-006 平台注册未生效 → no_go", () => {
    const r = req({ type: "registration", value: { platform: "UNGM" } });
    const report = evaluate([r], [cap("registration", { kind: "registration", platform: "UNGM", status: "inactive" })]);
    expect(report.verdict.decision).toBe("no_go");
  });

  it("C-007 技术参数边界达标（单位换算 50cm = 500mm）→ go", () => {
    const r = req({ type: "technical", value: { parameter: "width", operator: "<=", value: 500, unit: "mm" } });
    const report = evaluate([r], [cap("technical", { kind: "technical", parameter: "width", value: 50, unit: "cm" })]);
    expect(report.verdict.decision).toBe("go");
    expect(report.matrix[0].status).toBe("satisfied");
    expect(report.gaps).toHaveLength(0);
  });

  it("C-008 无法判定（商业条款未接入规则）→ conditional + unknowns", () => {
    const r = req({ type: "commercial", value: {} });
    const report = evaluate([r], []);
    expect(report.verdict.decision).toBe("conditional");
    expect(report.unknowns).toHaveLength(1);
    expect(report.unknowns[0].ruleId).toBe("UNK-01");
  });

  it("C-009 强制项全部满足 → go，无缺口", () => {
    const requirements = [
      req({ type: "certification", value: { code: "ISO9001" } }),
      req({ type: "experience", value: { years: 3, count: 2 } }),
      req({ type: "technical", value: { parameter: "power", operator: ">=", value: 10, unit: "kw" } }),
    ];
    const capabilities = [
      cap("certification", { kind: "certification", code: "ISO9001", validUntil: "2027-06-01" }),
      cap("experience", { kind: "experience", count: 3, years: 5 }),
      cap("technical", { kind: "technical", parameter: "power", value: 12000, unit: "w" }),
    ];
    const report = evaluate(requirements, capabilities);
    expect(report.verdict.decision).toBe("go");
    expect(report.gaps).toHaveLength(0);
    expect(report.verdict.score).toBeGreaterThan(0.9);
    expect(report.deterministic.rulesRun).toBe(3);
  });

  it("C-010 评分项不足（无强制缺失）→ conditional", () => {
    const r = req({ type: "experience", importance: "scored", value: { count: 5, years: 3 } });
    const report = evaluate([r], [cap("experience", { kind: "experience", count: 1, years: 5 })]);
    expect(report.verdict.decision).toBe("conditional");
    expect(report.gaps[0].status).toBe("partial");
  });

  it("未知项 / 不适用项不参与评分，且 unknown 进入 unknown 清单", () => {
    const na = req({ type: "localization", value: { applicable: false, notApplicableReason: "非本地招标" } });
    const unknown = req({ type: "personnel", value: {} });
    const report = evaluate([na, unknown], []);
    expect(report.deterministic.rulesNotApplicable).toBe(1);
    expect(report.unknowns).toHaveLength(1);
    expect(report.verdict.decision).toBe("conditional");
  });

  it("准备期不足会给出风险提示（不改变结论）", () => {
    const r = req({ type: "certification", value: { code: "ISO9001" } });
    const report = evaluateFeasibilityReport({
      noticePk: 1,
      enterpriseId: 1,
      requirements: [r],
      capabilities: [cap("certification", { kind: "certification", code: "ISO9001", validUntil: "2027-01-01" })],
      context: { bidDeadline: "2026-11-02T00:00:00.000Z", today: TODAY },
    });
    expect(report.verdict.reasons.some((reason) => reason.text.includes("准备期偏紧"))).toBe(true);
  });
});

describe("feasibility-report 知识表（证书等效 / 单位换算）", () => {
  it("证书编码归一化与等效判断", () => {
    expect(normalizeCertCode(" iso 9001 / gb ")).toBe("ISO9001GB");
    expect(equivalentCertCodes("ISO9001")).toContain("GB/T19001".toUpperCase().replace(/[\s.\-_/]/g, ""));
    expect(equivalentCertCodes("GB/T19001")).toContain("ISO9001");
  });

  it("单位换算与比较", () => {
    expect(toBaseUnit(50, "cm")).toEqual({ base: "mm", value: 500 });
    expect(compareWithUnit({ value: 50, unit: "cm" }, { value: 500, unit: "mm" })).toBe(0);
    expect(compareWithUnit({ value: 12000, unit: "w" }, { value: 10, unit: "kw" })).toBe(1);
    expect(compareWithUnit({ value: 1, unit: "unknown" }, { value: 1, unit: "mm" })).toBeNull();
  });
});
