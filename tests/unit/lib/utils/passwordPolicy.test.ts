import { describe, it, expect } from "vitest";
import { validatePassword, PASSWORD_MIN_LENGTH } from "@/lib/utils/passwordPolicy";

describe("validatePassword", () => {
  it("合法密码（字母+数字，≥8 位）→ valid", () => {
    expect(validatePassword("abc12345")).toEqual({ valid: true, message: "", messageKey: "" });
    expect(validatePassword("Test1234")).toEqual({ valid: true, message: "", messageKey: "" });
  });

  it("过短（<8 位）→ passwordTooShort", () => {
    const result = validatePassword("ab1");
    expect(result.valid).toBe(false);
    expect(result.messageKey).toBe("passwordTooShort");
  });

  it("纯字母无数字 → passwordNeedsDigit", () => {
    const result = validatePassword("abcdefgh");
    expect(result.valid).toBe(false);
    expect(result.messageKey).toBe("passwordNeedsDigit");
  });

  it("纯数字无字母 → passwordNeedsLetter", () => {
    const result = validatePassword("12345678");
    expect(result.valid).toBe(false);
    expect(result.messageKey).toBe("passwordNeedsLetter");
  });

  it("边界：恰好 8 位含字母和数字 → valid", () => {
    expect(validatePassword("a1b2c3d4").valid).toBe(true);
  });

  it("含特殊字符但满足字母+数字 → valid", () => {
    expect(validatePassword("P@ssw0rd!").valid).toBe(true);
  });

  it("PASSWORD_MIN_LENGTH 常量 = 8", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});
