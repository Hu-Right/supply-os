/**
 * 投标资格闸门 — A 段合格制与 B 段评分制互不换算。
 */
import { describe, expect, it } from "vitest";
import {
  BID_GATE_RULES,
  assertBidGateIntact,
  bidCompetitivenessLabel,
  bidEligibilityLabel,
  evaluateBidGate,
} from "@/shared/constants/diagnosis-bid-gate";
import {
  DIAGNOSIS_V3_FIELD_MAP,
  DIAGNOSIS_V3_FORM_FIELDS,
} from "@/shared/constants/diagnosis-v3";

type A = Record<string, string | string[]>;

/** 全选最高分：单选取最后一个选项，多选取全部选项 */
function bestAnswers(): A {
  const answers: A = {};
  for (const field of DIAGNOSIS_V3_FORM_FIELDS) {
    if (field.kind === "multi") answers[field.key] = [...(field.options ?? [])];
    else answers[field.key] = field.options?.[field.options.length - 1] ?? "";
  }
  return answers;
}

/** 全选第 index 个选项（用于构造「某一项不达标」） */
function withOption(answers: A, key: string, index: number): A {
  const field = DIAGNOSIS_V3_FIELD_MAP[key];
  return { ...answers, [key]: field.options?.[index] ?? "" };
}

const clean = { legalMissingCount: 0, certCoveragePercent: 100 };

describe("evaluateBidGate · 资格判定", () => {
  it("规则表自检通过（字段存在、选项序号在范围内）", () => {
    expect(() => assertBidGateIntact()).not.toThrow();
    expect(BID_GATE_RULES.length).toBeGreaterThanOrEqual(10);
  });

  it("全部达标 → qualified", () => {
    const r = evaluateBidGate(bestAnswers(), 50, clean);
    expect(r.eligibility).toBe("qualified");
    expect(r.disqualifiers).toHaveLength(0);
    expect(r.conditionals).toHaveLength(0);
    expect(r.derivedComplete).toBe(true);
    expect(bidEligibilityLabel(r.eligibility)).toBe("可进入投标名单");
  });

  it("无出口主体资质 → out（即使 B 段满分）", () => {
    const r = evaluateBidGate(withOption(bestAnswers(), "export_entity", 0), 50, clean);
    expect(r.eligibility).toBe("out");
    expect(r.disqualifiers.map((h) => h.id)).toContain("G-EXP-01");
    // 关键：总分不能把结论拉回来
    expect(r.competitiveness).toBe("strong");
    expect(r.verdictZh).toContain("总分高低不改变结论");
  });

  it("无合规制度 → out（制裁筛查是硬门槛）", () => {
    const r = evaluateBidGate(withOption(bestAnswers(), "compliance_governance", 0), 40, clean);
    expect(r.eligibility).toBe("out");
    expect(r.disqualifiers.map((h) => h.id)).toContain("G-COMP-01");
  });

  it("仅有内部检验、未取 ISO 9001 → out", () => {
    const r = evaluateBidGate(withOption(bestAnswers(), "quality_system", 1), 45, clean);
    expect(r.eligibility).toBe("out");
    expect(r.disqualifiers.map((h) => h.id)).toContain("G-QMS-01");
  });

  it("取到 ISO 9001 即不再是废标项", () => {
    const r = evaluateBidGate(withOption(bestAnswers(), "quality_system", 2), 45, clean);
    expect(r.eligibility).toBe("qualified");
  });

  it("只有可补项 → conditional，且不判出局", () => {
    const r = evaluateBidGate(withOption(bestAnswers(), "local_presence", 0), 35, clean);
    expect(r.eligibility).toBe("conditional");
    expect(r.disqualifiers).toHaveLength(0);
    expect(r.conditionals.map((h) => h.id)).toContain("G-LOC-01");
    expect(bidEligibilityLabel(r.eligibility)).toBe("有条件可投");
  });

  it("未作答不误报红项（空表 ≠ 出局）", () => {
    const r = evaluateBidGate({}, 0, {});
    expect(r.eligibility).toBe("qualified");
    expect(r.hits).toHaveLength(0);
    expect(r.derivedComplete).toBe(false);
  });
});

describe("evaluateBidGate · 目标市场准入缺口", () => {
  it("缺口 3 项 → out", () => {
    const r = evaluateBidGate(bestAnswers(), 50, { legalMissingCount: 3 });
    expect(r.eligibility).toBe("out");
    expect(r.disqualifiers.map((h) => h.id)).toContain("G-LGL-03");
  });

  it("缺口 1–2 项 → conditional", () => {
    for (const n of [1, 2]) {
      const r = evaluateBidGate(bestAnswers(), 50, { legalMissingCount: n });
      expect(r.eligibility).toBe("conditional");
      expect(r.conditionals.map((h) => h.id)).toContain("G-LGL-01");
    }
  });

  it("缺口数字写进缺口说明", () => {
    const r = evaluateBidGate(bestAnswers(), 50, { legalMissingCount: 4 });
    expect(r.disqualifiers.find((h) => h.id === "G-LGL-03")?.gapZh).toContain("4 项");
  });
});

describe("evaluateBidGate · 竞争力分档（只看 B 段，不看 A 段）", () => {
  const cases: Array<[number, string]> = [
    [50, "strong"],
    [40, "strong"], // 80/100
    [39, "strong"], // 78/100：正好压线，仍算达标
    [38, "viable"], // 76/100
    [30, "viable"], // 60/100
    [29, "weak"],
    [0, "weak"],
  ];
  for (const [partB, expected] of cases) {
    it(`B 段 ${partB}/50 → ${expected}`, () => {
      const r = evaluateBidGate(bestAnswers(), partB, clean);
      expect(r.competitiveness).toBe(expected);
      expect(r.eligibility).toBe("qualified");
    });
  }

  it("资格出局时竞争力仍单独成立（两个判断互不换算）", () => {
    const r = evaluateBidGate(withOption(bestAnswers(), "export_entity", 0), 10, clean);
    expect(r.eligibility).toBe("out");
    expect(r.competitiveness).toBe("weak");
    expect(bidCompetitivenessLabel("weak")).toBe("竞争力偏弱");
  });
});

describe("evaluateBidGate · 整改排序", () => {
  it("废标项排在可补项前，同级别按周期升序", () => {
    const a = withOption(bestAnswers(), "export_entity", 0); // 废标，30 天
    const b = withOption(a, "local_presence", 0); // 可补，90 天
    const c = withOption(b, "target_channels", 0); // 周期 14 天（单选取第 0 项不触发多选规则）
    const answers: A = { ...c, target_channels: [] }; // 多选一条不选 → G-CHN-01，14 天
    const r = evaluateBidGate(answers, 30, clean);
    expect(r.hits[0].level).toBe("disqualify");
    const softIds = r.conditionals.map((h) => h.id);
    expect(softIds[0]).toBe("G-CHN-01"); // 14 天最短
    expect(r.nextActions).toHaveLength(3);
  });
});
