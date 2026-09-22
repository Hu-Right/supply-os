/**
 * 套餐卡片权益 chip 对齐 V2 报价表测试（偏差 #1 回归防护）
 *
 * @description getPlanFeatures 必须按 benefit_rank 从对比矩阵 SSOT 取该档启用的权益，
 *              不得再出现 V2 报价表里不存在的旧标签（外贸交流群/供应商库入驻等）。
 */
import { describe, it, expect } from "vitest";
import { getPlanFeatures } from "@/features/membership/utils";
import type { MembershipPlan } from "@/types";

function plan(rank: number): MembershipPlan {
  return {
    plan_code: `p_${rank}`,
    name: `档${rank}`,
    price: rank * 100,
    currency: "CNY",
    unlock_quota: rank >= 3 ? 99999 : 10,
    free_quota: 0,
    plan_type: "subscription",
    benefit_rank: rank,
  };
}

const labelsOf = (rank: number) => getPlanFeatures(plan(rank)).map((f) => f.label);

describe("getPlanFeatures 按 benefit_rank 生成权益 chip", () => {
  it("体验档(1)：含摘要/相似/资格/文件，不含历史中标与 AI 评分", () => {
    const l = labelsOf(1);
    expect(l).toEqual(
      expect.arrayContaining(["comparisonSummary", "comparisonSimilar", "comparisonQualification", "comparisonDocDownload"]),
    );
    expect(l).not.toContain("comparisonAwardHistory");
    expect(l).not.toContain("comparisonAiScore");
  });

  it("标准档(2)：解锁历史中标，仍不含 AI 评分", () => {
    const l = labelsOf(2);
    expect(l).toContain("comparisonAwardHistory");
    expect(l).not.toContain("comparisonAiScore");
  });

  it("专业档(3)：解锁 AI 评分/解析报告/行业推送，不含企业画像", () => {
    const l = labelsOf(3);
    expect(l).toEqual(expect.arrayContaining(["comparisonAiScore", "comparisonReport", "comparisonIndustryPush"]));
    expect(l).not.toContain("comparisonEnterpriseProfile");
  });

  it("企业档(4)：含企业画像智能匹配与联合体投标", () => {
    const l = labelsOf(4);
    expect(l).toEqual(expect.arrayContaining(["comparisonEnterpriseProfile", "comparisonConsortium"]));
  });

  it("档位单调性：更高档 chip 集合包含低档全部", () => {
    const s1 = new Set(labelsOf(1));
    const s2 = new Set(labelsOf(2));
    const s4 = new Set(labelsOf(4));
    for (const x of s1) expect(s2.has(x)).toBe(true);
    for (const x of s2) expect(s4.has(x)).toBe(true);
  });

  it("不再出现旧 V1 标签（外贸交流群/供应商库入驻/专属客服等）", () => {
    const all = [0, 1, 2, 3, 4].flatMap(labelsOf);
    for (const stale of ["comparisonTradeGroup", "comparisonSupplierLibrary", "comparisonDedicatedSupport", "comparisonPrivateGroup"]) {
      expect(all).not.toContain(stale);
    }
  });
});
