// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  normalizeUnspscCodes,
  unspscPrefixFromCode,
  expandUnspscInterestPrefixes,
  padUnspscPrefix,
} from "../../../server/services/unspsc";

describe("normalizeUnspscCodes", () => {
  it("returns empty array for null", () => {
    expect(normalizeUnspscCodes(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(normalizeUnspscCodes(undefined)).toEqual([]);
  });

  it("parses JSON string with code field", () => {
    const input = JSON.stringify([{ code: "80101500", name: "Software" }]);
    const result = normalizeUnspscCodes(input);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("80101500");
  });

  it("extracts multiple codes from single field", () => {
    const input = [{ code: "80101500 80101600", name: "Multi" }];
    const result = normalizeUnspscCodes(input);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("deduplicates codes", () => {
    const input = [
      { code: "80101500", name: "A" },
      { code: "80101500", name: "B" },
    ];
    const result = normalizeUnspscCodes(input);
    expect(result).toHaveLength(1);
  });

  it("limits to 20 codes", () => {
    const input = Array.from({ length: 30 }, (_, i) => ({
      code: String(10000000 + i * 100),
      name: `Item ${i}`,
    }));
    const result = normalizeUnspscCodes(input);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("handles nested objects", () => {
    const input = [{ data: { code: "80101500", name: "Software" } }];
    const result = normalizeUnspscCodes(input);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("handles array of strings", () => {
    const input = ["80101500", "80101600"];
    const result = normalizeUnspscCodes(input);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

describe("unspscPrefixFromCode", () => {
  it("returns empty string for empty input", () => {
    expect(unspscPrefixFromCode("")).toBe("");
  });

  it("returns empty string for null", () => {
    expect(unspscPrefixFromCode(null as any)).toBe("");
  });

  it("extracts 2-digit prefix", () => {
    expect(unspscPrefixFromCode("80000000")).toBe("80");
  });

  it("extracts 4-digit prefix", () => {
    expect(unspscPrefixFromCode("80100000")).toBe("8010");
  });

  it("extracts 6-digit prefix", () => {
    expect(unspscPrefixFromCode("80101500")).toBe("801015");
  });

  it("extracts 8-digit code", () => {
    expect(unspscPrefixFromCode("80101501")).toBe("80101501");
  });

  it("strips non-digit characters", () => {
    expect(unspscPrefixFromCode("80-10-15-00")).toBe("801015");
  });

  it("handles short codes", () => {
    expect(unspscPrefixFromCode("80")).toBe("80");
  });
});

describe("expandUnspscInterestPrefixes", () => {
  it("returns empty array for empty code", () => {
    expect(expandUnspscInterestPrefixes("")).toEqual([]);
  });

  it("expands 8-digit code to 4 prefixes", () => {
    const result = expandUnspscInterestPrefixes("80101501");
    expect(result).toEqual(["80", "8010", "801015", "80101501"]);
  });

  it("expands 4-digit code to 2 prefixes", () => {
    const result = expandUnspscInterestPrefixes("80100000");
    expect(result).toEqual(["80", "8010"]);
  });

  it("deduplicates prefixes", () => {
    const result = expandUnspscInterestPrefixes("80000000");
    expect(result).toEqual(["80"]);
  });
});

describe("padUnspscPrefix", () => {
  it("pads short prefix to 8 digits", () => {
    expect(padUnspscPrefix("80")).toBe("80000000");
  });

  it("pads 4-digit prefix", () => {
    expect(padUnspscPrefix("8010")).toBe("80100000");
  });

  it("returns 8-digit code unchanged", () => {
    expect(padUnspscPrefix("80101501")).toBe("80101501");
  });

  it("truncates longer than 8 digits", () => {
    expect(padUnspscPrefix("80101501123")).toBe("80101501");
  });

  it("handles empty string", () => {
    expect(padUnspscPrefix("")).toBe("00000000");
  });
});
