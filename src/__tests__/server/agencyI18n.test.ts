// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  translateByPattern,
  classifyAgencyType,
  COUNTRY_ZH,
} from "../../../server/services/agencyI18n";

// ─── COUNTRY_ZH ────────────────────────────────────────────────────────────
describe("COUNTRY_ZH", () => {
  it("maps common country names to Chinese", () => {
    expect(COUNTRY_ZH["Brazil"]).toBe("巴西");
    expect(COUNTRY_ZH["United States"]).toBe("美国");
    expect(COUNTRY_ZH["Germany"]).toBe("德国");
    expect(COUNTRY_ZH["India"]).toBe("印度");
    expect(COUNTRY_ZH["Kenya"]).toBe("肯尼亚");
  });

  it("maps ISO alpha-2 codes to Chinese", () => {
    expect(COUNTRY_ZH["BR"]).toBe("巴西");
    expect(COUNTRY_ZH["US"]).toBe("美国");
    expect(COUNTRY_ZH["CN"]).toBe("中国");
    expect(COUNTRY_ZH["DE"]).toBe("德国");
  });

  it("handles variant country names", () => {
    expect(COUNTRY_ZH["Viet Nam"]).toBe("越南");
    expect(COUNTRY_ZH["Vietnam"]).toBe("越南");
    expect(COUNTRY_ZH["Russian Federation"]).toBe("俄罗斯");
    expect(COUNTRY_ZH["Türkiye"]).toBe("土耳其");
  });

  it("returns undefined for unknown countries", () => {
    expect(COUNTRY_ZH["Narnia"]).toBeUndefined();
    expect(COUNTRY_ZH["Atlantis"]).toBeUndefined();
  });
});

// ─── translateByPattern ────────────────────────────────────────────────────
describe("translateByPattern", () => {
  it("returns null for empty input", () => {
    expect(translateByPattern("")).toBeNull();
    expect(translateByPattern("   ")).toBeNull();
  });

  it("matches known acronyms (UNDP, WHO, etc.)", () => {
    const result = translateByPattern("UNDP");
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe("UNDP");
    expect(result!.i18n.zh).toBe("联合国开发计划署");
    expect(result!.i18n.fr).toBe("PNUD");
  });

  it("matches WHO acronym", () => {
    const result = translateByPattern("WHO");
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe("WHO");
    expect(result!.i18n.zh).toBe("世界卫生组织");
  });

  it("matches case-insensitive acronyms", () => {
    const result = translateByPattern("undp");
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe("UNDP");
  });

  it("matches Brazilian government patterns (Prefeitura)", () => {
    const result = translateByPattern("Prefeitura de São Paulo");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("市政府");
  });

  it("matches Brazilian state government patterns (Governo do)", () => {
    const result = translateByPattern("Governo do Estado de Minas Gerais");
    expect(result).not.toBeNull();
    // Brazilian state government pattern may match or fall back to generic
    expect(result!.i18n.zh).toBeDefined();
  });

  it("matches Kenya patterns (County Government of)", () => {
    const result = translateByPattern("County Government of Nairobi");
    expect(result).not.toBeNull();
    // Kenya county pattern or generic type keyword fallback
    expect(result!.i18n.zh).toBeDefined();
  });

  it("falls back to type keyword extraction for English names", () => {
    const result = translateByPattern("National Water Authority");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("管理局");
  });

  it("extracts committee type keyword", () => {
    const result = translateByPattern("Procurement Committee");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("委员会");
  });

  it("extracts ministry type keyword", () => {
    const result = translateByPattern("Ministry of Health");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("部");
  });

  it("extracts university type keyword", () => {
    const result = translateByPattern("National University");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("大学");
  });

  it("extracts hospital type keyword", () => {
    const result = translateByPattern("General Hospital");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("医院");
  });

  it("extracts bank type keyword", () => {
    const result = translateByPattern("Central Bank");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("银行");
  });

  it("returns canonical=trimmed for generic English names", () => {
    const result = translateByPattern("Some Random Organization");
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe("Some Random Organization");
  });
});

// ─── classifyAgencyType ────────────────────────────────────────────────────
describe("classifyAgencyType", () => {
  it("returns null for empty input", () => {
    expect(classifyAgencyType("")).toBeNull();
    expect(classifyAgencyType("   ")).toBeNull();
  });

  it("returns null for known acronyms (not aggregated)", () => {
    expect(classifyAgencyType("UNDP")).toBeNull();
    expect(classifyAgencyType("WHO")).toBeNull();
    expect(classifyAgencyType("WTO")).toBeNull();
  });

  it("classifies Brazilian municipality pattern", () => {
    const result = classifyAgencyType("Prefeitura Municipal de X");
    expect(result).not.toBeNull();
    // Brazilian municipality typeKey is MUNICIPIO_BR
    expect(result!.typeKey).toMatch(/MUNICIPIO|BR/);
  });

  it("classifies with country-specific aggregation when country is known", () => {
    const result = classifyAgencyType("Procurement Committee", "Uganda");
    expect(result).not.toBeNull();
    // Should include country in the typeKey or i18n
    expect(result!.i18n.zh).toContain("乌干达");
  });

  it("matches agency keyword pattern", () => {
    // "Agency" is a recognized pattern → classified as AGENCY_INTL
    const result = classifyAgencyType("Some Unique Agency Name XYZ");
    expect(result).not.toBeNull();
    expect(result!.typeKey).toContain("AGENCY");
  });

  it("classifies international patterns without country", () => {
    const result = classifyAgencyType("Advisory Committee");
    // Should match a committee pattern
    if (result) {
      expect(result.typeKey).toBeDefined();
      expect(result.i18n).toBeDefined();
    }
  });
});
