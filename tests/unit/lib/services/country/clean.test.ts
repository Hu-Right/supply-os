import { describe, expect, it } from "vitest";
import { cleanCountryRaw } from "@/lib/services/country/clean";

describe("cleanCountryRaw", () => {
  it("剥 JSON 数组包裹（单元素）", () => {
    expect(cleanCountryRaw('["Multi-Country"]')).toBe("Multi-Country");
  });

  it("剥 JSON 数组包裹（多元素转逗号分隔，供多国拆段）", () => {
    expect(cleanCountryRaw('["Brazil","China"]')).toBe("Brazil, China");
  });

  it("非 JSON 值原样通过（含逗号合法形态）", () => {
    expect(cleanCountryRaw("Canada, British Columbia")).toBe("Canada, British Columbia");
    expect(cleanCountryRaw("Philippines")).toBe("Philippines");
  });

  it("历史行为回归：脏前缀/HTML 实体/括号转逗号", () => {
    expect(cleanCountryRaw("/，Basilan")).toBe("Basilan");
    expect(cleanCountryRaw("T&#252;rkiye")).toBe("Türkiye");
    expect(cleanCountryRaw("Korea (Rep.)")).toBe("Korea, Rep.");
  });
});
