/**
 * CRM 客服输入校验 Schema 测试
 * @module lib/validators/chat.test
 */
import { describe, it, expect } from "vitest";
import {
  chatSessionCreateSchema,
  chatMessageSendSchema,
  sanitizeMetadata,
} from "@/lib/validators/chat";

describe("chatSessionCreateSchema", () => {
  it("接受合法入参", () => {
    const r = chatSessionCreateSchema.safeParse({
      customerName: "Alice",
      locale: "zh",
      aiSummary: "user: 你好",
    });
    expect(r.success).toBe(true);
  });

  it("接受空对象（所有字段可选）", () => {
    expect(chatSessionCreateSchema.safeParse({}).success).toBe(true);
  });

  it("拒绝超长字段", () => {
    expect(
      chatSessionCreateSchema.safeParse({ aiSummary: "x".repeat(8001) }).success,
    ).toBe(false);
    expect(
      chatSessionCreateSchema.safeParse({ customerName: "x".repeat(101) }).success,
    ).toBe(false);
  });

  it("拒绝非对象入参", () => {
    expect(chatSessionCreateSchema.safeParse("hello").success).toBe(false);
  });
});

describe("chatMessageSendSchema", () => {
  it("接受合法消息", () => {
    expect(
      chatMessageSendSchema.safeParse({ sessionId: 1, content: "你好" }).success,
    ).toBe(true);
  });

  it("拒绝空内容与超长内容", () => {
    expect(chatMessageSendSchema.safeParse({ sessionId: 1, content: "  " }).success).toBe(false);
    expect(chatMessageSendSchema.safeParse({ sessionId: 1, content: "x".repeat(4001) }).success).toBe(false);
  });

  it("拒绝非法 sessionId", () => {
    expect(chatMessageSendSchema.safeParse({ sessionId: 0, content: "hi" }).success).toBe(false);
    expect(chatMessageSendSchema.safeParse({ sessionId: 1.5, content: "hi" }).success).toBe(false);
  });
});

describe("sanitizeMetadata", () => {
  it("透传合法对象", () => {
    expect(sanitizeMetadata({ attachment: { url: "/uploads/chat/a.png" } })).toEqual({
      attachment: { url: "/uploads/chat/a.png" },
    });
  });

  it("null/undefined 返回 undefined", () => {
    expect(sanitizeMetadata(null)).toBeUndefined();
    expect(sanitizeMetadata(undefined)).toBeUndefined();
  });

  it("拒绝数组与非对象", () => {
    expect(sanitizeMetadata([1, 2])).toBeUndefined();
    expect(sanitizeMetadata("str")).toBeUndefined();
  });

  it("拒绝超体积对象（防夹带）", () => {
    expect(sanitizeMetadata({ blob: "x".repeat(9 * 1024) })).toBeUndefined();
  });
});
