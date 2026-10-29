/**
 * 投标可行性报告 —— 离线评估（规则引擎验收门禁）
 *
 * @script scripts/tools/feasibility-eval.ts
 * @usage npx tsx scripts/tools/feasibility-eval.ts [--json out.json] [--strict]
 * @description 读取 tests/fixtures/feasibility-report/cases.jsonl（专家标注的期望结论），
 *              用规则引擎重放并计算验收指标；硬门槛不达标 exit 1。
 *              指标口径见 docs/P0-投标可行性报告/03-评估集与验收标准.md。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { evaluateFeasibilityReport } from "../../src/lib/services/feasibility-report/engine";
import type {
  CapabilityItem,
  CapabilityValue,
  RequirementItem,
  RequirementType,
  Importance,
  RequirementValue,
  FeasibilityReport,
} from "../../src/lib/services/feasibility-report/types";

interface EvalCase {
  caseId: string;
  scene: string;
  notice: { noticePk: number; deadlineIso: string; todayIso?: string };
  requirements: Array<{
    type: RequirementType;
    importance: Importance;
    title: string;
    value?: RequirementValue | null;
    quote: string;
  }>;
  capabilities: Array<{ type: CapabilityItem["type"]; name: string; value: CapabilityValue; evidence?: boolean }>;
  expected: {
    decision: "go" | "no_go" | "conditional";
    mandatoryGaps: number;
    unknowns: number;
    gapStatuses: string[];
  };
}

const GATES = {
  decisionConsistency: 0.85,
  mandatoryLeak: 0,
  falsePositiveRate: 0.05,
  evidenceHitRate: 0.9,
  unknownRate: 0.2,
  traceability: 0.95,
};

function loadCases(path: string): EvalCase[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as EvalCase;
      } catch {
        throw new Error(`case #${index + 1} JSON 解析失败`);
      }
    });
}

function buildReport(evalCase: EvalCase): FeasibilityReport {
  const requirements: RequirementItem[] = evalCase.requirements.map((requirement, index) => ({
    id: `req-${index + 1}`,
    noticePk: evalCase.notice.noticePk,
    seq: index + 1,
    type: requirement.type,
    importance: requirement.importance,
    title: requirement.title,
    value: requirement.value ?? null,
    rawText: requirement.quote,
    source: { kind: "notice_text", quote: requirement.quote },
  }));
  const capabilities: CapabilityItem[] = evalCase.capabilities.map((capability, index) => ({
    id: `cap-${index + 1}`,
    enterpriseId: 1,
    type: capability.type,
    name: capability.name,
    value: capability.value,
    ...(capability.evidence === false
      ? {}
      : { evidenceRefs: [{ id: `ev-${index + 1}`, kind: "upload_file" as const, ref: `evidence:${index + 1}` }] }),
  }));
  return evaluateFeasibilityReport({
    noticePk: evalCase.notice.noticePk,
    enterpriseId: 1,
    requirements,
    capabilities,
    context: {
      bidDeadline: evalCase.notice.deadlineIso,
      today: evalCase.notice.todayIso ?? "2026-10-29T00:00:00.000Z",
    },
  });
}

function main(): void {
  const jsonFlag = process.argv.indexOf("--json");
  const outputPath = jsonFlag >= 0 ? process.argv[jsonFlag + 1] : null;
  const casesPath = "tests/fixtures/feasibility-report/cases.jsonl";
  const cases = loadCases(casesPath);
  if (cases.length === 0) throw new Error("评估集为空");

  let decisionOk = 0;
  let mandatoryLeak = 0;
  let falsePositive = 0;
  let expectedNoGo = 0;
  let evidenceHit = 0;
  let evidenceTotal = 0;
  let unknownTotal = 0;
  let requirementTotal = 0;
  let traceable = 0;
  const failures: string[] = [];

  for (const evalCase of cases) {
    const report = buildReport(evalCase);
    const actual = report.verdict.decision;
    const expected = evalCase.expected.decision;
    requirementTotal += report.deterministic.rulesRun;

    if (actual === expected) decisionOk += 1;
    if (expected === "no_go") {
      expectedNoGo += 1;
      if (actual !== "no_go") {
        mandatoryLeak += 1;
        failures.push(`${evalCase.caseId} 硬门槛漏判：期望 no_go，实际 ${actual}`);
      }
      if (actual === "go") falsePositive += 1;
    }
    const mandatoryGaps = report.gaps.filter((gap) => {
      const requirement = evalCase.requirements[Number(gap.requirementId.split("-")[1]) - 1];
      return requirement?.importance === "mandatory" && (gap.status === "missing" || gap.status === "expired");
    }).length;
    if (mandatoryGaps !== evalCase.expected.mandatoryGaps) {
      failures.push(`${evalCase.caseId} 强制缺口数不一致：期望 ${evalCase.expected.mandatoryGaps}，实际 ${mandatoryGaps}`);
    }
    if (report.unknowns.length !== evalCase.expected.unknowns) {
      failures.push(`${evalCase.caseId} 待确认数不一致：期望 ${evalCase.expected.unknowns}，实际 ${report.unknowns.length}`);
    }
    const statuses = report.gaps.map((gap) => gap.status).sort();
    const expectedStatuses = [...evalCase.expected.gapStatuses].sort();
    if (JSON.stringify(statuses) !== JSON.stringify(expectedStatuses)) {
      failures.push(`${evalCase.caseId} 缺口状态不一致：期望 [${expectedStatuses}]，实际 [${statuses}]`);
    }

    unknownTotal += report.unknowns.length;
    for (const row of report.matrix) {
      if (row.status === "satisfied" || row.status === "partial" || row.status === "expired") {
        evidenceTotal += 1;
        if (row.refs.length >= 2) evidenceHit += 1;
      }
      const requirement = evalCase.requirements[Number(row.requirementId.split("-")[1]) - 1];
      if (requirement?.quote) traceable += 1;
    }
  }

  const consistency = decisionOk / cases.length;
  const falsePositiveRate = expectedNoGo === 0 ? 0 : falsePositive / expectedNoGo;
  const evidenceHitRate = evidenceTotal === 0 ? 1 : evidenceHit / evidenceTotal;
  const unknownRate = requirementTotal === 0 ? 0 : unknownTotal / requirementTotal;
  const traceability = requirementTotal === 0 ? 1 : traceable / requirementTotal;

  const hardGates = {
    decisionConsistency: consistency >= GATES.decisionConsistency,
    mandatoryLeak: mandatoryLeak === GATES.mandatoryLeak,
    falsePositiveRate: falsePositiveRate <= GATES.falsePositiveRate,
    evidenceHitRate: evidenceHitRate >= GATES.evidenceHitRate,
    unknownRate: unknownRate <= GATES.unknownRate,
    traceability: traceability >= GATES.traceability,
  };

  const summary = {
    cases: cases.length,
    metrics: {
      decisionConsistency: Number(consistency.toFixed(3)),
      mandatoryLeak,
      falsePositiveRate: Number(falsePositiveRate.toFixed(3)),
      evidenceHitRate: Number(evidenceHitRate.toFixed(3)),
      unknownRate: Number(unknownRate.toFixed(3)),
      traceability: Number(traceability.toFixed(3)),
    },
    gates: GATES,
    hardGates,
    failures,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  if (!Object.values(hardGates).every(Boolean) || failures.length > 0) {
    console.error(`\n✖ 评估未通过：${failures.length} 条失败`);
    process.exit(1);
  }
  console.log("\n✓ 投标可行性报告规则评估通过（决策一致率/强制项漏判/证据命中/待确认率/可追溯性）");
}

main();
