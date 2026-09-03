/**
 * SSE 建连 Ticket 测试
 * @module lib/services/chatTicket.test
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "node:crypto";
import { signChatTicket, verifyChatTicket } from "@/lib/services/chatTicket";

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest";
});

describe("chatTicket", () => {
  it("签发后可校验通过并返回正确绑定信息", () => {
    const ticket = signChatTicket(1, 42);
    const verified = verifyChatTicket(ticket);
    expect(verified).toEqual({ userId: 1, sessionId: 42 });
  });

  it("一次性：同一 ticket 第二次校验被核销拒绝", () => {
    const ticket = signChatTicket(2, 7);
    expect(verifyChatTicket(ticket)).not.toBeNull();
    expect(verifyChatTicket(ticket)).toBeNull();
  });

  it("篡改 payload 校验失败", () => {
    const ticket = signChatTicket(3, 9);
    const [body] = ticket.split(".");
    const forged = Buffer.from(
      JSON.stringify({ i: 999, s: 9, exp: Date.now() + 60_000, n: "x" }),
    ).toString("base64url");
    // 用原签名 + 伪造 body
    const sig = ticket.split(".")[1];
    expect(verifyChatTicket(`${forged}.${sig}`)).toBeNull();
    // 原始 body 仍有效（未核销）—— 上一行失败不消耗
    expect(verifyChatTicket(ticket)).not.toBeNull();
    void body;
  });

  it("格式错误的 ticket 返回 null", () => {
    expect(verifyChatTicket("")).toBeNull();
    expect(verifyChatTicket("no-dot")).toBeNull();
    expect(verifyChatTicket("abc.def.ghi")).toBeNull();
  });

  it("签名合法但 body 非 JSON → null（解析异常分支）", () => {
    const body = Buffer.from("not-a-json-payload").toString("base64url");
    const sig = createHmac("sha256", process.env.JWT_SECRET!).update(body).digest("base64url");
    expect(verifyChatTicket(`${body}.${sig}`)).toBeNull();
  });

  it("签名合法但 exp 已过期 → null", () => {
    const expired = forgeTicket({ i: 5, s: 1, exp: Date.now() - 1000, n: "n-expired" });
    expect(verifyChatTicket(expired)).toBeNull();
  });

  it("签名合法但 s 非数字 → null", () => {
    const bad = forgeTicket({ i: 5, s: "not-a-number", exp: Date.now() + 60_000, n: "n-bads" });
    expect(verifyChatTicket(bad)).toBeNull();
  });

  it("JWT_SECRET 未配置 → 签发抛错", () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      expect(() => signChatTicket(1, 1)).toThrow("JWT_SECRET is not configured");
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });

  it("核销表超限 → 周期清理过期项（防表无限增长）", () => {
    const used = (globalThis as any)._chatTicketUsed as Map<string, number>;
    // 预置 10001 条已过期核销记录，触发 markUsed 的清理分支
    for (let i = 0; i < 10_001; i++) used.set(`stale-${i}`, Date.now() - 1000);
    const ticket = signChatTicket(8, 88);
    expect(verifyChatTicket(ticket)).toEqual({ userId: 8, sessionId: 88 });
    // 全部过期项被清理（有效期内其他用例的记录保留）
    let staleLeft = 0;
    for (const k of used.keys()) if (k.startsWith("stale-")) staleLeft++;
    expect(staleLeft).toBe(0);
  });
});

/** 用与实现一致的 HMAC 算法构造"签名合法"的 ticket（用于 payload 校验分支） */
function forgeTicket(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", process.env.JWT_SECRET!).update(body).digest("base64url");
  return `${body}.${sig}`;
}
