/**
 * server/utils/passwordPolicy.ts 测试
 */
import { describe, it, expect } from "vitest";
import { validatePassword, PASSWORD_MIN_LENGTH } from "../../../server/utils/passwordPolicy";

describe("validatePassword", () => {
  it("PASSWORD_MIN_LENGTH 为 8", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it("合法密码通过", () => {
    expect(validatePassword("abc12345")).toEqual({ valid: true, message: "", messageKey: "" });
    expect(validatePassword("Test1234")).toEqual({ valid: true, message: "", messageKey: "" });
    expect(validatePassword("P@ssw0rd!")).toEqual({ valid: true, message: "", messageKey: "" });
  });

  it("太短返回 passwordTooShort", () => {
    const r = validatePassword("ab1");
    expect(r.valid).toBe(false);
    expect(r.messageKey).toBe("passwordTooShort");
  });

  it("恰好 8 位但无字母", () => {
    const r = validatePassword("12345678");
    expect(r.valid).toBe(false);
    expect(r.messageKey).toBe("passwordNeedsLetter");
  });

  it("恰好 8 位但无数字", () => {
    const r = validatePassword("abcdefgh");
    expect(r.valid).toBe(false);
    expect(r.messageKey).toBe("passwordNeedsDigit");
  });

  it("边界：恰好 7 位", () => {
    const r = validatePassword("abc1234");
    expect(r.valid).toBe(false);
    expect(r.messageKey).toBe("passwordTooShort");
  });
});
