/**
 * SSE 建连 Ticket 测试
 * @module lib/services/chatTicket.test
 */
import { describe, it, expect, beforeAll } from "vitest";
import { signChatTicket, verifyChatTicket } from "./chatTicket";

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-vitest";
});

describe("chatTicket", () => {
  it("签发后可校验通过并返回正确绑定信息", () => {
    const ticket = signChatTicket("user-001", 42);
    const verified = verifyChatTicket(ticket);
    expect(verified).toEqual({ userKey: "user-001", sessionId: 42 });
  });

  it("一次性：同一 ticket 第二次校验被核销拒绝", () => {
    const ticket = signChatTicket("user-002", 7);
    expect(verifyChatTicket(ticket)).not.toBeNull();
    expect(verifyChatTicket(ticket)).toBeNull();
  });

  it("篡改 payload 校验失败", () => {
    const ticket = signChatTicket("user-003", 9);
    const [body] = ticket.split(".");
    const forged = Buffer.from(
      JSON.stringify({ u: "attacker", s: 9, exp: Date.now() + 60_000, n: "x" }),
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
});
