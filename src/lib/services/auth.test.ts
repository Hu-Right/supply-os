import { describe, it, expect } from "vitest";
import { hashPasswordLegacy, hashVerificationCode, needsUpgrade } from "./auth";
import crypto from "crypto";

describe("hashPasswordLegacy", () => {
  it("SHA-256 哈希输出", () => {
    const hash = hashPasswordLegacy("password123");
    const expected = crypto.createHash("sha256").update("password123").digest("hex");
    expect(hash).toBe(expected);
  });

  it("相同输入 → 相同哈希", () => {
    expect(hashPasswordLegacy("test")).toBe(hashPasswordLegacy("test"));
  });

  it("不同输入 → 不同哈希", () => {
    expect(hashPasswordLegacy("a")).not.toBe(hashPasswordLegacy("b"));
  });
});

describe("hashVerificationCode", () => {
  it("带 verify_code: 前缀的 SHA-256", () => {
    const hash = hashVerificationCode("123456");
    const expected = crypto.createHash("sha256").update("verify_code:123456").digest("hex");
    expect(hash).toBe(expected);
  });

  it("输出为 64 字符十六进制", () => {
    const hash = hashVerificationCode("000000");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("needsUpgrade", () => {
  it("非 bcrypt → 需要升级", () => {
    expect(needsUpgrade("sha256")).toBe(true);
    expect(needsUpgrade("legacy")).toBe(true);
  });

  it("bcrypt → 无需升级", () => {
    expect(needsUpgrade("bcrypt")).toBe(false);
  });
});
