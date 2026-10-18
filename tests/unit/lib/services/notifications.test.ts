/**
 * notifications 服务单测（mock pool）
 *
 * @module tests/unit/lib/services/notifications
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { pushNotification, listNotifications, markRead, unreadCount } from "@/lib/services/notifications";

function pool(query: ReturnType<typeof vi.fn>): Pool {
  return { query } as unknown as Pool;
}

describe("pushNotification", () => {
  it("以参数化写入并回传 insertId", async () => {
    const q = vi.fn().mockResolvedValue([{ insertId: 55 }]);
    const id = await pushNotification(pool(q), {
      userId: 6, type: "rfq_quoted", title: "新报价", body: "100 CNY", link: "/rfq/5", refId: 777,
    });
    expect(id).toBe(55);
    const [sql, params] = q.mock.calls[0];
    expect(String(sql)).toContain("INSERT INTO crm_notifications");
    expect(params).toEqual([6, "rfq_quoted", "新报价", "100 CNY", "/rfq/5", 777]);
  });
});

describe("listNotifications", () => {
  it("计数 + 取行并映射，unreadOnly 追加 is_read 条件", async () => {
    const q = vi.fn()
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[
        { id: 9, type: "rfq_won", title: "中选", body: null, link: "/rfq/5", is_read: 0, created_at: "2026-10-17 10:00:00" },
      ]]);
    const res = await listNotifications(pool(q), 6, { unreadOnly: true });
    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({ id: 9, type: "rfq_won", isRead: false, body: "" });
    expect(String(q.mock.calls[0]?.[0])).toContain("is_read = 0");
  });
});

describe("markRead / unreadCount", () => {
  it("命中返回 true", async () => {
    const q = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    expect(await markRead(pool(q), 6, 9)).toBe(true);
    expect(String(q.mock.calls[0]?.[0])).toContain("SET is_read = 1");
  });
  it("未命中返回 false", async () => {
    const q = vi.fn().mockResolvedValue([{ affectedRows: 0 }]);
    expect(await markRead(pool(q), 6, 9)).toBe(false);
  });
  it("未读数解析", async () => {
    const q = vi.fn().mockResolvedValue([[{ total: 3 }]]);
    expect(await unreadCount(pool(q), 6)).toBe(3);
  });
});
