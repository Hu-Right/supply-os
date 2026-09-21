/**
 * 权益门控 SSOT 语义固化测试
 * benefit-matrix — pin tests
 *
 * @description 钉住《云境产品服务权益报价表_260921_V2》定稿矩阵的门控语义：
 *              各功能的最低档位边界、免费档摘要脱敏的维度可见性。
 *              公告详情六模块 / 前后端闸门一律读本模块，本测试即门控契约的可执行定义。
 */
import { describe, it, expect } from "vitest";
import {
  BENEFIT_RANK,
  FEATURE_REQUIRED_RANK,
  hasFeature,
  resolveBenefitRank,
  maskSummaryForFree,
  SUMMARY_DIMENSIONS,
  COMPARISON_ROWS,
  comparisonRowEnabled,
  type MaskableSummary,
  type ComparisonRow,
} from "@/lib/services/benefit-matrix";

function makeSummary(overrides: Partial<MaskableSummary> = {}): MaskableSummary {
  return {
    coreDeliverables: "采购内容",
    keyQualifications: "资格条件",
    paymentCycle: "付款周期",
    competitiveLandscape: "竞争格局",
    bidStrategy: "投标策略",
    riskAlerts: "风险提示",
    ...overrides,
  };
}

describe("BENEFIT_RANK 档位常量", () => {
  it("五档严格递增：免费0/体验1/标准2/专业3/企业4", () => {
    expect(BENEFIT_RANK.FREE).toBe(0);
    expect(BENEFIT_RANK.TRIAL).toBe(1);
    expect(BENEFIT_RANK.STANDARD).toBe(2);
    expect(BENEFIT_RANK.PRO).toBe(3);
    expect(BENEFIT_RANK.ENTERPRISE).toBe(4);
  });
});

describe("hasFeature 门控边界", () => {
  it("摘要/相似/资格/文件：免费档(0)即可访问", () => {
    for (const f of ["summary", "similar", "qualification", "files"] as const) {
      expect(FEATURE_REQUIRED_RANK[f]).toBe(BENEFIT_RANK.FREE);
      expect(hasFeature(0, f)).toBe(true);
    }
  });

  it("历史中标(award_history)：标准档(2)起，1→拒 2→放", () => {
    expect(hasFeature(1, "award_history")).toBe(false);
    expect(hasFeature(2, "award_history")).toBe(true);
    expect(hasFeature(3, "award_history")).toBe(true);
  });

  it("AI 适配评分(ai_score)：专业档(3)起，2→拒 3→放", () => {
    expect(hasFeature(2, "ai_score")).toBe(false);
    expect(hasFeature(3, "ai_score")).toBe(true);
    expect(hasFeature(4, "ai_score")).toBe(true);
  });

  it("档位高于要求一律放行（企业档享全部）", () => {
    for (const f of ["summary", "similar", "award_history", "ai_score"] as const) {
      expect(hasFeature(BENEFIT_RANK.ENTERPRISE, f)).toBe(true);
    }
  });
});

describe("resolveBenefitRank 身份与额度分离", () => {
  it("无周期性套餐（currentBest 为 null/undefined）→ 免费档 0", () => {
    expect(resolveBenefitRank(null)).toBe(0);
    expect(resolveBenefitRank(undefined)).toBe(0);
  });
  it("单次卡持有者 currentBest 缺失 → 仍为免费档（R1：单次卡不授予档位）", () => {
    expect(resolveBenefitRank({})).toBe(0);
  });
  it("透传套餐 benefit_rank", () => {
    expect(resolveBenefitRank({ benefit_rank: 3 })).toBe(3);
  });
});

describe("maskSummaryForFree 免费档脱敏", () => {
  it("coreDeliverables 完整保留（唯一免费可见维度）", () => {
    const s = makeSummary({ coreDeliverables: "完整采购内容".repeat(100) });
    expect(maskSummaryForFree(s).coreDeliverables).toBe(s.coreDeliverables);
  });

  it("keyQualifications 截断到 200 字试读", () => {
    const long = "资格".repeat(500); // 1000 字
    const masked = maskSummaryForFree(makeSummary({ keyQualifications: long }));
    expect(masked.keyQualifications).toHaveLength(200);
    expect(long.startsWith(masked.keyQualifications)).toBe(true);
  });

  it("keyQualifications 不足 200 字 → 原样保留不截断", () => {
    const short = "短资格条件";
    expect(maskSummaryForFree(makeSummary({ keyQualifications: short })).keyQualifications).toBe(short);
  });

  it("付款周期/竞争格局/投标策略/风险提示 → 整段置空", () => {
    const masked = maskSummaryForFree(makeSummary());
    expect(masked.paymentCycle).toBe("");
    expect(masked.competitiveLandscape).toBe("");
    expect(masked.bidStrategy).toBe("");
    expect(masked.riskAlerts).toBe("");
  });

  it("不修改入参（纯函数，返回新对象）", () => {
    const input = makeSummary();
    const snapshot = { ...input };
    maskSummaryForFree(input);
    expect(input).toEqual(snapshot);
  });

  it("六个维度 key 与 SUMMARY_DIMENSIONS 严格对齐（防字段漂移）", () => {
    const s = makeSummary();
    for (const dim of SUMMARY_DIMENSIONS) {
      expect(s).toHaveProperty(dim);
    }
  });
});

const row = (key: string): ComparisonRow => {
  const r = COMPARISON_ROWS.find((x) => x.key === key);
  if (!r) throw new Error(`对比矩阵缺少行：${key}`);
  return r;
};

describe("COMPARISON_ROWS 对比矩阵", () => {
  it("每行都有分组/键/标签，且分组仅 core|advanced", () => {
    for (const r of COMPARISON_ROWS) {
      expect(r.key).toBeTruthy();
      expect(r.label).toBeTruthy();
      expect(["core", "advanced"]).toContain(r.group);
    }
  });

  it("feature 型行的展示判定与后端 hasFeature 完全同源", () => {
    for (const r of COMPARISON_ROWS.filter((x) => x.feature)) {
      for (const rank of [0, 1, 2, 3, 4]) {
        expect(comparisonRowEnabled(rank, r)).toBe(hasFeature(rank, r.feature!));
      }
    }
  });

  it("历史中标：标准档(2)起亮", () => {
    expect(comparisonRowEnabled(1, row("award_history"))).toBe(false);
    expect(comparisonRowEnabled(2, row("award_history"))).toBe(true);
  });

  it("AI 适配评分：专业档(3)起亮", () => {
    expect(comparisonRowEnabled(2, row("ai_score"))).toBe(false);
    expect(comparisonRowEnabled(3, row("ai_score"))).toBe(true);
  });

  it("中文解析报告/行业推送：专业档(3)起（minRank 型）", () => {
    for (const k of ["report", "industry_push"]) {
      expect(comparisonRowEnabled(2, row(k))).toBe(false);
      expect(comparisonRowEnabled(3, row(k))).toBe(true);
    }
  });

  it("企业画像智能匹配/联合体投标：企业档(4)才亮", () => {
    for (const k of ["enterprise_profile", "consortium"]) {
      expect(comparisonRowEnabled(3, row(k))).toBe(false);
      expect(comparisonRowEnabled(4, row(k))).toBe(true);
    }
  });

  it("额度/有效期行为特列渲染（恒返回 true，值由组件按数字计算）", () => {
    expect(comparisonRowEnabled(0, row("quota"))).toBe(true);
    expect(comparisonRowEnabled(0, row("validity"))).toBe(true);
  });

  it("高层权益必包含低层（单调性）：若 rank 已亮则更高 rank 仍亮", () => {
    for (const r of COMPARISON_ROWS) {
      let prev = false;
      for (const rank of [0, 1, 2, 3, 4]) {
        const on = comparisonRowEnabled(rank, r);
        if (prev) expect(on).toBe(true);
        prev = on;
      }
    }
  });
});
