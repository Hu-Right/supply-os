import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { normalizeUnsubEmail, verifyUnsubToken } from "@/lib/services/unsubscribe/token";

const SECRET = "test-unsub-secret";

function sign(email: string, tenant: number, secret = SECRET): string {
  const payload = `${email}|${tenant}`;
  const body = Buffer.from(payload, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${body}.${sig}`;
}

describe("unsubscribe token", () => {
  it("归一化：去空白 + 小写", () => {
    expect(normalizeUnsubEmail(" A@B.com ")).toBe("a@b.com");
  });

  it("验签通过并还原邮箱", () => {
    expect(verifyUnsubToken(sign("a@b.com", 0), SECRET)).toEqual({ email: "a@b.com", tenantId: 0 });
  });

  it("签名/载荷被篡改一律拒绝", () => {
    const token = sign("a@b.com", 0);
    expect(verifyUnsubToken(`${token}x`, SECRET)).toBeNull();
    expect(verifyUnsubToken(token.replace(/^./, "x"), SECRET)).toBeNull();
    expect(verifyUnsubToken("", SECRET)).toBeNull();
  });

  it("密钥不匹配拒绝", () => {
    expect(verifyUnsubToken(sign("a@b.com", 0), "other")).toBeNull();
  });

  it("载荷里邮箱非法拒绝", () => {
    expect(verifyUnsubToken(sign("not-an-email", 0), SECRET)).toBeNull();
  });

  it("未配置密钥一律返回 null（不误放行）", () => {
    expect(verifyUnsubToken(sign("a@b.com", 0), "")).toBeNull();
    expect(verifyUnsubToken(sign("a@b.com", 0), undefined)).toBeNull();
  });
});