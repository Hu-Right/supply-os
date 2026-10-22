/**
 * notifications API client 测试
 * @module tests/unit/core/api/notifications
 * @description 钉住收件箱读路径的 wire 契约（2026-10 信封迁移）：
 *              ① /api/notifications 返回裸列表本体 { items, total, unread, ... }，
 *                 client 直接透传——若仍从 { code, message, data } 的 .data 解包会得到 undefined，
 *                 铃铛下拉恒空（本测试即回归钉）；
 *              ② markNotificationRead 命中 PATCH、成功不抛（PATCH 现返回裸 { ok: true }）。
 *              仅 stub fetch，不触真实网络。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNotifications, markNotificationRead } from "@/core/api/notifications";

vi.mock("@/core/perf", () => ({ recordApiMetric: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("notifications client · 裸载荷契约", () => {
  it("fetchNotifications 直接返回裸列表本体（不解包 .data）", async () => {
    const body = {
      items: [{ id: 1, type: "system", title: "标题", body: "正文", link: "/x", isRead: false, createdAt: "2026-01-01" }],
      total: 1,
      unread: 1,
      page: 1,
      page_size: 20,
    };
    fetchMock.mockResolvedValue(Response.json(body));
    const r = await fetchNotifications();
    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(1);
    expect(r.unread).toBe(1);
    // 回归钉：漏改 .data 时 r 会是 undefined，此处直接抛错
    expect(Array.isArray(r.items)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/notifications?page_size=20"), expect.anything());
  });

  it("markNotificationRead 命中 PATCH 端点且成功返回 void", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    await expect(markNotificationRead(5)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/notifications/5"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
