import { describe, it, expect } from "vitest";
import { normalizeProjectFields } from "@/lib/services/procurement/projects";

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
