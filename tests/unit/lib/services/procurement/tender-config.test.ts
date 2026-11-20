import { describe, it, expect } from "vitest";
import { derivePublishConfig } from "@/lib/services/procurement/tender-config";

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

  it("itb/rfp 派生缺省评标法（开放前由方式闸拦截发布）", () => {
    expect(derivePublishConfig("itb", null).awardMethod).toBe("lowest_evaluated");
    expect(derivePublishConfig("rfp", null).awardMethod).toBe("comprehensive");
    expect(derivePublishConfig("rfp", null).envelopePolicy).toBe("none");
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
