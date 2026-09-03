import { describe, it, expect } from "vitest";
import { normalizePem, isParseablePrivateKey, isParseablePublicKey } from "./keys";
import crypto from "crypto";

describe("normalizePem", () => {
  it("已有 BEGIN/END 包裹 → 原样返回（trim 后）", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----";
    expect(normalizePem(pem, "PRIVATE KEY")).toBe(pem);
  });

  it("无包裹的裸密钥 → 自动补全 PEM 格式", () => {
    const raw = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const result = normalizePem(raw, "PRIVATE KEY");
    expect(result).toContain("-----BEGIN PRIVATE KEY-----");
    expect(result).toContain("-----END PRIVATE KEY-----");
  });

  it("空值 → 空字符串", () => {
    expect(normalizePem("", "PRIVATE KEY")).toBe("");
  });
});

describe("isParseablePrivateKey", () => {
  it("真实 Ed25519 私钥 → true", () => {
    const { privateKey } = crypto.generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    expect(isParseablePrivateKey(privateKey)).toBe(true);
  });

  it("占位符 → false", () => {
    expect(isParseablePrivateKey("placeholder_key")).toBe(false);
    expect(isParseablePrivateKey("")).toBe(false);
  });
});

describe("isParseablePublicKey", () => {
  it("真实 Ed25519 公钥 → true", () => {
    const { publicKey } = crypto.generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    expect(isParseablePublicKey(publicKey)).toBe(true);
  });

  it("无效公钥 → false", () => {
    expect(isParseablePublicKey("not-a-key")).toBe(false);
    expect(isParseablePublicKey("")).toBe(false);
  });
});
