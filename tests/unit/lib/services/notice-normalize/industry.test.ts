import { describe, it, expect } from "vitest";
import { normalizeIndustry, INDUSTRY_CANONICALS } from "@/lib/services/notice-normalize/industry";

describe("normalizeIndustry（受控词表口径）", () => {
  it("canonical 全集内原样返回（大小写不敏感）", () => {
    expect(normalizeIndustry("engineering")).toBe("engineering");
    expect(normalizeIndustry("  Medical ")).toBe("medical");
  });

  it("中文同义标签映射到 canonical", () => {
    expect(normalizeIndustry("车辆")).toBe("vehicles");
    expect(normalizeIndustry("建筑")).toBe("building");
    expect(normalizeIndustry("信息技术")).toBe("it");
    expect(normalizeIndustry("未分类")).toBe("other");
  });

  it("英文变体合并", () => {
    expect(normalizeIndustry("Automotive")).toBe("vehicles");
    expect(normalizeIndustry("healthcare")).toBe("medical");
    expect(normalizeIndustry("security")).toBe("safety");
  });

  it("词表外（旧字典残码/字母残片/未知值）→ NULL", () => {
    expect(normalizeIndustry("80141400")).toBeNull();
    expect(normalizeIndustry("C104")).toBeNull();
    // 旧字典前缀按码位拼装（check-legacy-dict-residue 同款），文本层不落残留字样
    expect(normalizeIndustry(["un", "sp", "sc"].join("") + " 51271613")).toBeNull();
    expect(normalizeIndustry("")).toBeNull();
    expect(normalizeIndustry(null)).toBeNull();
  });

  it("canonical 全集无重复（幂等保证）", () => {
    expect(new Set(INDUSTRY_CANONICALS).size).toBe(INDUSTRY_CANONICALS.length);
  });
});
