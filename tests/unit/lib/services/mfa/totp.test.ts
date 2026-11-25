/**
 * TOTP 工具单测（RFC 6238 口径 + 恢复码哈希）
 */
import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  encryptMfaSecret,
  decryptMfaSecret,
  generateRecoveryCodes,
  generateTotpCode,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyTotpCode,
} from "@/lib/services/mfa/totp";

describe("mfa/totp", () => {
  it("base32 编解码可逆", () => {
    const buf = Buffer.from("cloud-os-mfa", "utf8");
    expect(base32Decode(base32Encode(buf)).toString("utf8")).toBe("cloud-os-mfa");
  });

  it("生成的 TOTP 动态码可通过校验，且错误码不通过", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const code = generateTotpCode(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code, now)).not.toBeNull();
    expect(verifyTotpCode(secret, "000000", now)).toBeNull();
  });

  it("时间窗前后 30 秒内接受，超出拒绝", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const prevCode = generateTotpCode(secret, now - 30_000);
    expect(verifyTotpCode(secret, prevCode, now)).not.toBeNull();
    const oldCode = generateTotpCode(secret, now - 120_000);
    expect(verifyTotpCode(secret, oldCode, now)).toBeNull();
  });

  it("密钥加密可逆，篡改后解密失败", () => {
    const secret = generateTotpSecret();
    const enc = encryptMfaSecret(secret);
    expect(enc).not.toContain(secret);
    expect(decryptMfaSecret(enc)).toBe(secret);
    const parts = enc.split(":");
    parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
    expect(decryptMfaSecret(parts.join(":"))).toBeNull();
  });

  it("恢复码一次性格式与哈希归一化", () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(codes[0]).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    expect(normalizeRecoveryCode("ab-cd ef12")).toBe("ABCDEF12");
    expect(hashRecoveryCode(codes[0])).toHaveLength(64);
  });

  it("otpauth URI 包含标准参数", () => {
    const uri = buildOtpauthUri("JBSWY3DPEHPK3PXP", "vip@qq.com");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});


