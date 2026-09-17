/**
 * crypto.ts 单元测试：AES-256-GCM 加解密往返与篡改检测
 * @module tests/unit/lib/services/ai-summary/crypto.test
 */
import { describe, it, expect, beforeEach } from "vitest";
import { encryptApiKey, decryptApiKey } from "@/lib/services/ai-summary/crypto";

describe("crypto AES-256-GCM", () => {
  const original = process.env.LLM_KEY_SECRET;
  beforeEach(() => {
    process.env.LLM_KEY_SECRET = "test-secret-key-for-unit-tests";
  });

  it("加密后可解密还原原文", () => {
    const plain = "sk-abc123def456";
    const cipher = encryptApiKey(plain);
    expect(cipher).not.toContain(plain);
    expect(decryptApiKey(cipher)).toBe(plain);
  });

  it("相同明文两次加密产生不同密文（随机 IV）", () => {
    const plain = "sk-same";
    expect(encryptApiKey(plain)).not.toBe(encryptApiKey(plain));
  });

  it("密文被篡改时解密抛错", () => {
    const cipher = encryptApiKey("sk-abc");
    const tampered = cipher.slice(0, -2) + "xx";
    expect(() => decryptApiKey(tampered)).toThrow();
  });

  it("未配置 LLM_KEY_SECRET 时加密抛错", () => {
    delete process.env.LLM_KEY_SECRET;
    expect(() => encryptApiKey("sk-abc")).toThrow();
    process.env.LLM_KEY_SECRET = original;
  });
});
