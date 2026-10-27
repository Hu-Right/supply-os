/**
 * chat 消息视图 mapper 单测（命名红线② 的收口点）
 * @module tests/unit/lib/services/chat-view-mapping.test.ts
 * @description 三处出口（GET 列表 / POST 回显 / SSE 推送）共用本 mapper，因此只要测住 mapper 本身，
 *              就同时测住了三个出口的键名口径；另两面（是否漏接某个 json(...)）由
 *              check-api-field-naming 静态拦。这里不连库：ChatMessageRow 是纯结构。
 */
import { describe, expect, it } from "vitest";
import { messageViewOf, messagesViewOf } from "@/lib/services/chat-service";
import type { ChatMessageRow } from "@/lib/repos/chat.repo";

const ROW = {
  id: 7,
  session_id: 42,
  role: "customer" as const,
  content: "hello",
  metadata: '{"attachment":{}}',
  created_at: new Date("2026-10-27T03:00:00.000Z"),
} as unknown as ChatMessageRow;

describe("messageViewOf", () => {
  it("响应键全部 camelCase，且不残留 DB 列名", () => {
    const v = messageViewOf(ROW);
    expect(v.sessionId).toBe(42);
    expect(v.createdAt).toBe(ROW.created_at);
    expect(v).not.toHaveProperty("session_id");
    expect(v).not.toHaveProperty("created_at");
    const snake = Object.keys(v).filter((k) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k));
    expect(snake).toEqual([]);
  });

  it("值原样透传：只归位键名，不改时间格式与 metadata 内容（避免改名顺带改行为）", () => {
    const v = messageViewOf(ROW);
    expect(v.createdAt).toBeInstanceOf(Date);
    expect(v.createdAt.toISOString()).toBe("2026-10-27T03:00:00.000Z");
    expect(v.metadata).toBe('{"attachment":{}}');
    expect(v.id).toBe(7);
    expect(v.role).toBe("customer");
    expect(v.content).toBe("hello");
  });

  it("id/session_id 为字符串时归一为 number（DB 驱动 BIGINT 常回传字符串）", () => {
    const v = messageViewOf({ ...ROW, id: "7", session_id: "42" } as unknown as ChatMessageRow);
    expect(v.id).toBe(7);
    expect(v.sessionId).toBe(42);
  });

  it("messagesViewOf 保序批量映射，空列表返回空数组", () => {
    expect(messagesViewOf([])).toEqual([]);
    const rows = [ROW, { ...ROW, id: 8, role: "agent" as const }];
    const list = messagesViewOf(rows);
    expect(list.map((m) => m.id)).toEqual([7, 8]);
    expect(list.map((m) => m.role)).toEqual(["customer", "agent"]);
    expect(list.every((m) => "sessionId" in m && "createdAt" in m)).toBe(true);
  });
});
