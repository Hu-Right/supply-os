/**
 * server/services/auth.ts 测试（纯函数部分）
 */
import { describe, it, expect } from "vitest";
import {
  hashPasswordLegacy,
  verifyPassword,
  needsUpgrade,
  hashVerificationCode,
} from "../../../server/services/auth";

describe("hashPasswordLegacy", () => {
  it("SHA-256 哈希为 64 位 hex", () => {
    const hash = hashPasswordLegacy("password123");
    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("相同输入产生相同哈希", () => {
    expect(hashPasswordLegacy("test")).toBe(hashPasswordLegacy("test"));
  });

  it("不同输入产生不同哈希", () => {
    expect(hashPasswordLegacy("a")).not.toBe(hashPasswordLegacy("b"));
  });
});

describe("verifyPassword", () => {
  it("bcrypt 类型验证", async () => {
    // 使用一个已知的 bcrypt hash（$2b$12$ 前缀）
    // 为 "test1234" 的 bcrypt hash
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.hash("test1234", 4);
    const result = await verifyPassword("test1234", hash, "bcrypt");
    expect(result).toBe(true);

    const wrongResult = await verifyPassword("wrong", hash, "bcrypt");
    expect(wrongResult).toBe(false);
  });

  it("sha256 兼容验证", async () => {
    const hash = hashPasswordLegacy("mypassword");
    const result = await verifyPassword("mypassword", hash, "sha256");
    expect(result).toBe(true);

    const wrongResult = await verifyPassword("wrong", hash, "sha256");
    expect(wrongResult).toBe(false);
  });
});

describe("needsUpgrade", () => {
  it("非 bcrypt 需要升级", () => {
    expect(needsUpgrade("sha256")).toBe(true);
    expect(needsUpgrade("md5")).toBe(true);
  });

  it("bcrypt 不需要升级", () => {
    expect(needsUpgrade("bcrypt")).toBe(false);
  });
});

describe("hashVerificationCode", () => {
  it("验证码哈希为 64 位 hex", () => {
    const hash = hashVerificationCode("123456");
    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("相同验证码产生相同哈希", () => {
    expect(hashVerificationCode("123456")).toBe(hashVerificationCode("123456"));
  });

  it("不同验证码产生不同哈希", () => {
    expect(hashVerificationCode("123456")).not.toBe(hashVerificationCode("654321"));
  });
});
