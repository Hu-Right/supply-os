/**
 * notifications 服务单测（mock pool）
 *
 * @module tests/unit/lib/services/notifications
 * @description 覆盖 2026-11 改造：payload（渲染参数）与 dedupe_key（事件幂等）落库、
 *              重复投递返回 0、JSON 列读回解析、按类型族过滤、全部已读。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import {
  deleteNotifications,
  getNotification,
  listNotifications,
  markAllRead,
  markRead,
  markReadMany,
  pushNotification,
  pushNotificationSafe,
  unreadCount,
} from "@/lib/services/notifications";

function pool(query: ReturnType<typeof vi.fn>): Pool {
  return { query } as unknown as Pool;
}

describe("pushNotification", () => {
  it("以参数化写入并回传 insertId（含 payload / dedupe_key 列）", async () => {
    const q = vi.fn().mockResolvedValue([{ insertId: 55 }]);
    const id = await pushNotification(pool(q), {
      userId: 6, type: "rfq_quoted", title: "新报价", body: "100 CNY", link: "/rfq/5", refId: 777,
    });
    expect(id).toBe(55);
    const [sql, params] = q.mock.calls[0];
    expect(String(sql)).toContain("INSERT INTO notifications");
    // 未给 payload/dedupeKey 时写 NULL（列齐全，避免旧调用方漏字段）
    expect(params).toEqual([6, "rfq_quoted", "新报价", "100 CNY", "/rfq/5", 777, null, null]);
  });

  it("payload 序列化为 JSON，dedupeKey 原样落库", async () => {
    const q = vi.fn().mockResolvedValue([{ insertId: 56 }]);
    await pushNotification(pool(q), {
      userId: 6,
      type: "procurement.published",
      title: "",
      link: "/rfq/123/publish",
      refId: 123,
      payload: { reference: "OSPR-2026-000123", tenderNo: "OSPT-2026-000009" },
      dedupeKey: "procurement.published:123:v2",
    });
    const params = q.mock.calls[0][1] as unknown[];
    expect(params[6]).toBe(JSON.stringify({ reference: "OSPR-2026-000123", tenderNo: "OSPT-2026-000009" }));
    expect(params[7]).toBe("procurement.published:123:v2");
  });

  it("唯一键冲突（事件重试）→ 返回 0，不抛错", async () => {
    const q = vi.fn().mockRejectedValue(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }));
    expect(await pushNotification(pool(q), { userId: 6, type: "buyer.verified", title: "" })).toBe(0);
  });

  it("pushNotificationSafe：非唯一键错误也吞掉并返回 0（通知不拖垮主流程）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const q = vi.fn().mockRejectedValue(new Error("db down"));
    expect(await pushNotificationSafe(pool(q), { userId: 6, type: "buyer.verified", title: "" })).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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

  it("payload 为 JSON 字符串时解析为对象（mysql2 视列类型可能回字符串）", async () => {
    const q = vi.fn()
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[
        {
          id: 10,
          type: "procurement.published",
          title: "",
          body: null,
          link: "/rfq/123/publish",
          is_read: 1,
          created_at: "2026-11-14 22:00:00",
          payload: '{"reference":"OSPR-2026-000123","tenderNo":"OSPT-2026-000009"}',
        },
      ]]);
    const res = await listNotifications(pool(q), 6);
    expect(res.items[0].payload).toEqual({ reference: "OSPR-2026-000123", tenderNo: "OSPT-2026-000009" });
    expect(res.items[0].isRead).toBe(true);
  });

  it("type_prefix 过滤拼进 WHERE 并带参数（不拼接原始字符串）", async () => {
    const q = vi.fn()
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);
    await listNotifications(pool(q), 6, { typePrefix: "procurement." });
    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("type LIKE ?");
    expect(params).toEqual([6, "procurement.%"]);
  });
});

describe("getNotification", () => {
  it("命中返回视图对象，未命中返回 null", async () => {
    const hit = vi.fn().mockResolvedValue([[{
      id: 11, type: "buyer.verified", title: "", body: null, link: "/settings/buyer",
      is_read: 0, created_at: "2026-11-14 22:00:00", payload: { status: "verified" },
    }]]);
    const one = await getNotification(pool(hit), 6, 11);
    expect(one).toMatchObject({ id: 11, type: "buyer.verified", isRead: false, link: "/settings/buyer" });

    const miss = vi.fn().mockResolvedValue([[]]);
    expect(await getNotification(pool(miss), 6, 99)).toBeNull();
  });
});

describe("markRead / markAllRead / unreadCount", () => {
  it("命中返回 true", async () => {
    const q = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    expect(await markRead(pool(q), 6, 9)).toBe(true);
    expect(String(q.mock.calls[0]?.[0])).toContain("SET is_read = 1");
  });
  it("未命中返回 false", async () => {
    const q = vi.fn().mockResolvedValue([{ affectedRows: 0 }]);
    expect(await markRead(pool(q), 6, 9)).toBe(false);
  });
  it("全部已读：按类型族限定并返回条数", async () => {
    const q = vi.fn().mockResolvedValue([{ affectedRows: 7 }]);
    expect(await markAllRead(pool(q), 6, { typePrefix: "buyer." })).toBe(7);
    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("is_read = 0");
    expect(sql).toContain("type LIKE ?");
    expect(params).toEqual([6, "buyer.%"]);
  });
  it("未读数解析", async () => {
    const q = vi.fn().mockResolvedValue([[{ total: 3 }]]);
    expect(await unreadCount(pool(q), 6)).toBe(3);
  });
});

describe("批量操作（P2）", () => {
  it("markReadMany：按 ids 批量已读，空列表不查库", async () => {
    const q = vi.fn().mockResolvedValue([{ affectedRows: 2 }]);
    expect(await markReadMany(pool(q), 6, [11, 12])).toBe(2);
    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("id IN (?,?)");
    expect(params).toEqual([6, 11, 12]);

    const empty = vi.fn();
    expect(await markReadMany(pool(empty), 6, [])).toBe(0);
    expect(empty).not.toHaveBeenCalled();
  });

  it("deleteNotifications：按 ids 软删（写 deleted_at，不物理删除）", async () => {
    const q = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    expect(await deleteNotifications(pool(q), 6, { ids: [9] })).toBe(1);
    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("SET deleted_at = NOW()");
    expect(sql).toContain("deleted_at IS NULL");
    expect(sql).toContain("id IN (?)");
    expect(params).toEqual([6, 9]);
  });

  it("deleteNotifications：all + 分类范围 → 不带 id 条件", async () => {
    const q = vi.fn().mockResolvedValue([{ affectedRows: 5 }]);
    const n = await deleteNotifications(pool(q), 6, { all: true, types: ["buyer.verified", "buyer.need_info"] });
    expect(n).toBe(5);
    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("type IN (?,?)");
    expect(sql).not.toContain("id IN (");
    expect(params).toEqual([6, "buyer.verified", "buyer.need_info"]);
  });

  it("listNotifications：types 精确集合拼 IN，且过滤软删", async () => {
    const q = vi.fn()
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);
    await listNotifications(pool(q), 6, { types: ["procurement.matched"] });
    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("deleted_at IS NULL");
    expect(sql).toContain("type IN (?)");
    expect(params).toEqual([6, "procurement.matched"]);
  });
});
