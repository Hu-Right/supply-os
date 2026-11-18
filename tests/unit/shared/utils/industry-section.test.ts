/**
 * 行业词表/展示标签单测（2026-11-18 剔除「采购主题 slug → GB/T 行业门类」桥接后）
 *
 * 钉两件事：
 * ① 服务表 industry 只认 canonical slug（历史别名可归一，UGT-I 树码一律判无效）；
 * ② 展示层用「采购类别」标签（医疗/卫生、工程/技术），不再出现行业门类语义。
 */
import { describe, it, expect } from "vitest";
import {
  INDUSTRY_CANONICALS,
  industryDisplayName,
  normalizeIndustry,
} from "@/shared/utils/industry-section";

describe("industry-section（行业词表 / 展示标签）", () => {
  it("历史别名归一：中文同义与英文变体都收敛到 canonical", () => {
    expect(normalizeIndustry("工程制造")).toBe("engineering");
    expect(normalizeIndustry("healthcare")).toBe("medical");
    expect(normalizeIndustry("BUILDING")).toBe("building");
  });

  it("UGT-I 行业树码不再属于有效值（桥接已剔除）", () => {
    expect(normalizeIndustry("UGT-I-17")).toBeNull();
    expect(industryDisplayName("UGT-I-17", "zh")).toBeNull();
  });

  it("展示为采购类别标签，而不是行业门类", () => {
    expect(industryDisplayName("medical", "zh")).toBe("医疗/卫生");
    expect(industryDisplayName("engineering", "zh")).toBe("工程/技术");
    expect(industryDisplayName("engineering", "en")).toBe("Engineering / Technical services");
  });

  it("空值 / 词表外值 → null（调用方隐藏该行，绝不回退原始乱值）", () => {
    expect(industryDisplayName(null, "zh")).toBeNull();
    expect(industryDisplayName("", "zh")).toBeNull();
    expect(industryDisplayName("random-junk", "zh")).toBeNull();
  });

  it("canonical 全集都有中英标签（展示层不会出现空标签）", () => {
    for (const code of INDUSTRY_CANONICALS) {
      expect(industryDisplayName(code, "zh"), `zh label missing: ${code}`).toBeTruthy();
      expect(industryDisplayName(code, "en"), `en label missing: ${code}`).toBeTruthy();
    }
  });
});
