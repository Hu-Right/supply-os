// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseOptionalInt, parseOptionalString } from "../../../server/utils/params";

// ─── parseOptionalInt ──────────────────────────────────────────────────────
describe("parseOptionalInt", () => {
  it("returns fallback when key is missing", () => {
    expect(parseOptionalInt({}, "page", 1, 100, 1)).toBe(1);
  });

  it("returns fallback for non-numeric values", () => {
    expect(parseOptionalInt({ page: "abc" }, "page", 1, 100, 1)).toBe(1);
    expect(parseOptionalInt({ page: "" }, "page", 1, 100, 1)).toBe(1);
    expect(parseOptionalInt({ page: null }, "page", 1, 100, 1)).toBe(1);
  });

  it("parses valid integer strings", () => {
    expect(parseOptionalInt({ page: "5" }, "page", 1, 100, 1)).toBe(5);
    expect(parseOptionalInt({ limit: "20" }, "limit", 1, 100, 10)).toBe(20);
  });

  it("floors decimal values", () => {
    expect(parseOptionalInt({ page: "5.9" }, "page", 1, 100, 1)).toBe(5);
    expect(parseOptionalInt({ page: "1.1" }, "page", 1, 100, 1)).toBe(1);
  });

  it("clamps to minimum", () => {
    expect(parseOptionalInt({ page: "-5" }, "page", 1, 100, 1)).toBe(1);
    expect(parseOptionalInt({ page: "0" }, "page", 1, 100, 1)).toBe(1);
  });

  it("clamps to maximum", () => {
    expect(parseOptionalInt({ page: "999" }, "page", 1, 100, 1)).toBe(100);
    expect(parseOptionalInt({ page: "101" }, "page", 1, 100, 1)).toBe(100);
  });

  it("uses default fallback of 0", () => {
    expect(parseOptionalInt({}, "offset", 0, 1000)).toBe(0);
  });

  it("handles NaN and Infinity", () => {
    // NaN → not finite → fallback
    expect(parseOptionalInt({ v: "NaN" }, "v", 0, 100, 5)).toBe(5);
    // Infinity → not finite → fallback
    expect(parseOptionalInt({ v: "Infinity" }, "v", 0, 100, 5)).toBe(5);
  });

  it("handles array query values (first element)", () => {
    // Express ParsedQs can have arrays for repeated params
    expect(parseOptionalInt({ page: ["5", "10"] } as any, "page", 1, 100, 1)).toBe(1);
  });
});

// ─── parseOptionalString ───────────────────────────────────────────────────
describe("parseOptionalString", () => {
  it("returns empty string when key is missing", () => {
    expect(parseOptionalString({}, "q")).toBe("");
  });

  it("returns empty string for null/undefined", () => {
    expect(parseOptionalString({ q: null }, "q")).toBe("");
    expect(parseOptionalString({ q: undefined }, "q")).toBe("");
  });

  it("trims whitespace", () => {
    expect(parseOptionalString({ q: "  hello  " }, "q")).toBe("hello");
    expect(parseOptionalString({ q: "\t\n" }, "q")).toBe("");
  });

  it("truncates to maxLen", () => {
    const long = "a".repeat(300);
    const result = parseOptionalString({ q: long }, "q", 200);
    expect(result.length).toBe(200);
  });

  it("uses default maxLen of 200", () => {
    const long = "a".repeat(250);
    const result = parseOptionalString({ q: long }, "q");
    expect(result.length).toBe(200);
  });

  it("converts non-string values to string", () => {
    expect(parseOptionalString({ q: 123 } as any, "q")).toBe("123");
    expect(parseOptionalString({ q: true } as any, "q")).toBe("true");
  });

  it("preserves internal whitespace", () => {
    expect(parseOptionalString({ q: "hello world" }, "q")).toBe("hello world");
  });
});
