// @vitest-environment node
import { describe, it, expect } from "vitest";
import { maskPhone, maskEmail, splitListField } from "../../../server/utils/mask";

describe("maskPhone", () => {
  it("returns empty string for null", () => {
    expect(maskPhone(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(maskPhone(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(maskPhone("")).toBe("");
  });

  it("masks short phone numbers (< 8 chars)", () => {
    expect(maskPhone("12345")).toBe("12****");
  });

  it("masks phone numbers with exactly 7 chars", () => {
    expect(maskPhone("1234567")).toBe("12****");
  });

  it("masks phone numbers with 8+ chars", () => {
    expect(maskPhone("12345678")).toBe("123****5678");
  });

  it("masks long phone numbers", () => {
    expect(maskPhone("+8613800138000")).toBe("+86****8000");
  });

  it("trims whitespace", () => {
    expect(maskPhone("  12345678  ")).toBe("123****5678");
  });

  it("handles numeric input", () => {
    expect(maskPhone(12345678)).toBe("123****5678");
  });
});

describe("maskEmail", () => {
  it("returns empty string for null", () => {
    expect(maskEmail(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(maskEmail(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(maskEmail("")).toBe("");
  });

  it("returns *** for string without @", () => {
    expect(maskEmail("noemail")).toBe("***");
  });

  it("returns *** for string starting with @", () => {
    expect(maskEmail("@domain.com")).toBe("***");
  });

  it("masks email with short local part", () => {
    expect(maskEmail("a@test.com")).toBe("a***@test.com");
  });

  it("masks email with normal local part", () => {
    expect(maskEmail("john@example.com")).toBe("jo***@example.com");
  });

  it("masks email with long local part", () => {
    expect(maskEmail("longname@test.com")).toBe("lo***@test.com");
  });

  it("trims whitespace", () => {
    expect(maskEmail("  test@example.com  ")).toBe("te***@example.com");
  });
});

describe("splitListField", () => {
  it("returns empty array for null", () => {
    expect(splitListField(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(splitListField(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(splitListField("")).toEqual([]);
  });

  it("splits by comma", () => {
    expect(splitListField("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("splits by Chinese comma", () => {
    expect(splitListField("a，b，c")).toEqual(["a", "b", "c"]);
  });

  it("splits by semicolon", () => {
    expect(splitListField("a;b;c")).toEqual(["a", "b", "c"]);
  });

  it("splits by Chinese enumeration comma", () => {
    expect(splitListField("a、b、c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace from items", () => {
    expect(splitListField(" a , b , c ")).toEqual(["a", "b", "c"]);
  });

  it("filters empty items", () => {
    expect(splitListField("a,,b,,c")).toEqual(["a", "b", "c"]);
  });

  it("handles mixed separators", () => {
    expect(splitListField("a,b；c、d")).toEqual(["a", "b", "c", "d"]);
  });

  it("returns single item for no separator", () => {
    expect(splitListField("single")).toEqual(["single"]);
  });
});
