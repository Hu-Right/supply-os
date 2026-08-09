// @vitest-environment node
import { describe, it, expect } from "vitest";
import { safeJson, preferValue } from "../../../server/utils/json";

describe("safeJson", () => {
  it("returns [] for null", () => {
    expect(safeJson(null)).toEqual([]);
  });

  it("returns [] for undefined", () => {
    expect(safeJson(undefined)).toEqual([]);
  });

  it("returns [] for empty string", () => {
    expect(safeJson("")).toEqual([]);
  });

  it("returns [] for 0", () => {
    expect(safeJson(0)).toEqual([]);
  });

  it("returns array as-is", () => {
    const arr = [1, 2, 3];
    expect(safeJson(arr)).toBe(arr);
  });

  it("returns empty array as-is", () => {
    expect(safeJson([])).toEqual([]);
  });

  it("parses valid JSON string", () => {
    expect(safeJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it("parses JSON object string", () => {
    expect(safeJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns [] for invalid JSON string", () => {
    expect(safeJson("not json")).toEqual([]);
  });

  it("returns [] for malformed JSON", () => {
    expect(safeJson("{broken}")).toEqual([]);
  });

  it("parses nested JSON", () => {
    expect(safeJson('[{"a":1},{"b":2}]')).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

describe("preferValue", () => {
  it("returns primary when it has a value", () => {
    expect(preferValue("hello", "fallback")).toBe("hello");
  });

  it("returns fallback when primary is null", () => {
    expect(preferValue(null, "fallback")).toBe("fallback");
  });

  it("returns fallback when primary is undefined", () => {
    expect(preferValue(undefined, "fallback")).toBe("fallback");
  });

  it("returns fallback when primary is empty string", () => {
    expect(preferValue("", "fallback")).toBe("fallback");
  });

  it("returns fallback when primary is empty array", () => {
    expect(preferValue([], "fallback")).toBe("fallback");
  });

  it("returns primary when it is 0", () => {
    expect(preferValue(0, "fallback")).toBe(0);
  });

  it("returns primary when it is false", () => {
    expect(preferValue(false, "fallback")).toBe(false);
  });

  it("returns primary non-empty array", () => {
    expect(preferValue([1, 2], "fallback")).toEqual([1, 2]);
  });

  it("returns primary when it is an object", () => {
    expect(preferValue({ a: 1 }, "fallback")).toEqual({ a: 1 });
  });

  it("returns fallback when fallback is any type", () => {
    expect(preferValue(null, [1, 2])).toEqual([1, 2]);
    expect(preferValue(undefined, { x: 1 })).toEqual({ x: 1 });
  });
});
