/**
 * src/shared/auth/passwordPolicy.ts 测试
 */
import { describe, it, expect } from "vitest";
import { validatePassword, PASSWORD_MIN_LENGTH } from "../../../../src/shared/auth/passwordPolicy";

describe("validatePassword (shared)", () => {
  it("PASSWORD_MIN_LENGTH 为 8", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it("合法密码通过", () => {
    expect(validatePassword("abc12345").valid).toBe(true);
    expect(validatePassword("Test1234").valid).toBe(true);
  });

  it("太短返回 passwordTooShort", () => {
    const r = validatePassword("ab1");
    expect(r.valid).toBe(false);
    expect(r.messageKey).toBe("passwordTooShort");
  });

  it("无字母返回 passwordNeedsLetter", () => {
    const r = validatePassword("12345678");
    expect(r.valid).toBe(false);
    expect(r.messageKey).toBe("passwordNeedsLetter");
  });

  it("无数字返回 passwordNeedsDigit", () => {
    const r = validatePassword("abcdefgh");
    expect(r.valid).toBe(false);
    expect(r.messageKey).toBe("passwordNeedsDigit");
  });
});
