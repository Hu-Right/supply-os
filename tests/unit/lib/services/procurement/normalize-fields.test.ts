import { describe, it, expect } from "vitest";
import { normalizeProjectFields } from "@/lib/services/procurement/projects";
import { PROCUREMENT_METHOD, PROCUREMENT_METHOD_AVAILABLE } from "@/shared/constants/procurement";

describe("normalizeProjectFields JSON 列", () => {
  it("guaranteeConfig 数组序列化为 JSON 字符串（不能直接传数组给 mysql2）", () => {
    const out = normalizeProjectFields({
      guaranteeConfig: [
        { type: "bid_bond", otherName: "", form: "bank", basis: "percent", value: 2, note: "" },
      ],
    });
    expect(typeof out.guarantee_config).toBe("string");
    expect(JSON.parse(String(out.guarantee_config))).toHaveLength(1);
  });

  it("空 guaranteeConfig → null", () => {
    const out = normalizeProjectFields({ guaranteeConfig: [] });
    expect(out.guarantee_config).toBeNull();
  });

  it("certRequirements 仍按 JSON 序列化", () => {
    const out = normalizeProjectFields({ certRequirements: [{ code: "CE", name: "CE" }] });
    expect(typeof out.cert_requirements).toBe("string");
  });
});

describe("normalizeProjectFields 采购方式（method）", () => {
  it("method 进入可编辑列：值原样规范化为 method 列", () => {
    expect(normalizeProjectFields({ method: "rfq" }).method).toBe("rfq");
    expect(PROCUREMENT_METHOD_AVAILABLE).toContain(normalizeProjectFields({ method: "rfq" }).method);
  });

  it("P1b 可用集 = rfq + eoi + rfp（方式选择器与服务端校验的唯一口径）", () => {
    expect(PROCUREMENT_METHOD_AVAILABLE).toEqual([
      PROCUREMENT_METHOD.RFQ,
      PROCUREMENT_METHOD.EOI,
      PROCUREMENT_METHOD.RFP,
    ]);
  });
});

