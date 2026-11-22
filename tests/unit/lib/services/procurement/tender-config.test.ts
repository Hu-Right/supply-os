import { describe, it, expect } from "vitest";
import { derivePublishConfig } from "@/lib/services/procurement/tender-config";
import { EVAL_TEMPLATE_PRESET_70_30, isValidEvalTemplate } from "@/shared/constants/procurement";

/**
 * 发布配置派生契约（设计稿 §14 兼容声明）：
 * rfq 无覆盖配置时逐字段等于 P0 硬编码值（public / sealed=1 / lowest_price）——
 * 这是「rfq 行为零变化」红线的纯函数级证据。
 */
describe("derivePublishConfig 发布配置派生", () => {
  it("rfq 无覆盖 = P0 硬编码值（行为零变化）", () => {
    expect(derivePublishConfig("rfq", null)).toEqual({
      publishMode: "public",
      sealed: true,
      awardMethod: "lowest_price",
      envelopePolicy: "none",
    });
    expect(derivePublishConfig("rfq", { publish_mode: undefined, award_method: null, envelope_policy: undefined } as never)).toEqual({
      publishMode: "public",
      sealed: true,
      awardMethod: "lowest_price",
      envelopePolicy: "none",
    });
  });

  it("eoi 派生：不密封 + 资格筛选（意向征集语义）", () => {
    expect(derivePublishConfig("eoi", null)).toEqual({
      publishMode: "public",
      sealed: false,
      awardMethod: "eligibility_filter",
      envelopePolicy: "none",
    });
  });

  it("rfp 派生：综合评分 + 双信封强制（方式固定语义，不随配置退化）", () => {
    expect(derivePublishConfig("rfp", null)).toEqual({
      publishMode: "public",
      sealed: true,
      awardMethod: "comprehensive",
      envelopePolicy: "tech_fin_split",
    });
    // 配置写了 none 也强制双信封
    expect(derivePublishConfig("rfp", { publish_mode: "public", award_method: null, envelope_policy: "none" } as never).envelopePolicy).toBe(
      "tech_fin_split",
    );
  });

  it("itb 派生缺省最低评审价（开放前由方式闸拦截发布）", () => {
    expect(derivePublishConfig("itb", null).awardMethod).toBe("lowest_evaluated");
    expect(derivePublishConfig("itb", null).envelopePolicy).toBe("none");
  });

  it("采购方覆盖优先于方式缺省", () => {
    expect(
      derivePublishConfig("rfq", { publish_mode: "targeted", award_method: null, envelope_policy: "none" } as never)
        .publishMode,
    ).toBe("targeted");
  });

  it("未知方式兜底密封+最低价（发布闸会先行拒绝，此为纯函数防御）", () => {
    expect(derivePublishConfig("lta", null).sealed).toBe(true);
    expect(derivePublishConfig("lta", null).awardMethod).toBe("lowest_price");
  });
});

describe("isValidEvalTemplate 评分模板校验（发布闸）", () => {
  it("70/30 预设合法（维度合计=technicalMax=70，门槛线在半开区间）", () => {
    expect(isValidEvalTemplate(EVAL_TEMPLATE_PRESET_70_30)).toBe(true);
    expect(EVAL_TEMPLATE_PRESET_70_30.dimensions.reduce((a, d) => a + d.weight, 0)).toBe(70);
  });

  it("权重不闭合/门槛越界/空维度/非对象 → 拒绝", () => {
    expect(isValidEvalTemplate({ dimensions: [{ key: "a", label: "A", weight: 60 }], technicalMax: 70, technicalThreshold: 40 })).toBe(false);
    expect(isValidEvalTemplate({ dimensions: [{ key: "a", label: "A", weight: 70 }], technicalMax: 70, technicalThreshold: 70 })).toBe(false);
    expect(isValidEvalTemplate({ dimensions: [], technicalMax: 70, technicalThreshold: 40 })).toBe(false);
    expect(isValidEvalTemplate(null)).toBe(false);
    expect(isValidEvalTemplate("x")).toBe(false);
  });
});
