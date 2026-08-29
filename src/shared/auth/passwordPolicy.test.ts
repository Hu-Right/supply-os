import { describe, it, expect } from "vitest";
import { validatePassword, PASSWORD_MIN_LENGTH } from "./passwordPolicy";

describe("shared/auth/passwordPolicy", () => {
  it("合法密码 → valid", () => {
    expect(validatePassword("abc12345").valid).toBe(true);
  });

  it("过短 → passwordTooShort", () => {
    const r = validatePassword("ab1");
    expect(r.valid).toBe(false);
    expect(r.messageKey).toBe("passwordTooShort");
  });

  it("纯字母 → passwordNeedsDigit", () => {
    const r = validatePassword("abcdefgh");
    expect(r.valid).toBe(false);
    expect(r.messageKey).toBe("passwordNeedsDigit");
  });

  it("纯数字 → passwordNeedsLetter", () => {
    const r = validatePassword("12345678");
    expect(r.valid).toBe(false);
    expect(r.messageKey).toBe("passwordNeedsLetter");
  });

  it("与 lib/utils/passwordPolicy 行为一致（双端同步验证）", async () => {
    // 前端 shared 与后端 lib 的密码策略必须完全一致
    const testCases = ["abc12345", "short", "nonnumbers", "12345678", "P@ssw0rd!"];
    const { validatePassword: libValidate } = await import("@/lib/utils/passwordPolicy");
    for (const pw of testCases) {
      const sharedResult = validatePassword(pw);
      const libResult = libValidate(pw);
      expect(sharedResult.valid).toBe(libResult.valid);
      expect(sharedResult.messageKey).toBe(libResult.messageKey);
    }
  });

  it("PASSWORD_MIN_LENGTH = 8", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});
