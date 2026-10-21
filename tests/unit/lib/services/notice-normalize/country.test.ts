import { describe, expect, it } from "vitest";
import { normalizeCountry } from "@/lib/services/notice-normalize/country";

describe("normalizeCountry", () => {
  it("Brazil → BR", () => {
    expect(normalizeCountry("Brazil")).toMatchObject({ code: "BR", source: "raw" });
  });
  it("Côte d'Ivoire → CI", () => {
    expect(normalizeCountry("Côte d'Ivoire")).toMatchObject({ code: "CI", source: "alias" });
  });
  it("USA → US", () => {
    expect(normalizeCountry("USA")).toMatchObject({ code: "US", source: "alias" });
  });
  it("South Africa → ZA", () => {
    expect(normalizeCountry("South Africa")).toMatchObject({ code: "ZA" });
  });
  it("空国家 + .br URL → BR（低置信）", () => {
    expect(normalizeCountry("", "https://pncp.gov.br/app/editais/x")).toMatchObject({
      code: "BR",
      source: "url",
      confidence: 60,
    });
  });
  it("未知国家保留原名，code=null", () => {
    expect(normalizeCountry("Atlantis")).toMatchObject({ code: null, name: "Atlantis", confidence: 0 });
  });
});
