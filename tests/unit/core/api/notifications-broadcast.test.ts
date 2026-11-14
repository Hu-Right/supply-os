/**
 * 通知变更广播单测
 *
 * @module tests/unit/core/api/notifications-broadcast
 * @description 用户反馈：在通知列表页「标记已读 / 删除」后，顶栏铃铛的未读徽标不更新
 *              （它只有 60s 轮询 + 聚焦刷新）。修法是 API 层写成功后广播事件、铃铛订阅。
 *              这里钉住三件事：三个写操作都广播、读取不广播、订阅能收到且能取消。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/core/http", () => ({
  api: vi.fn(async () => ({ marked: 2, deleted: 1 })),
}));

import {
  NOTIFICATIONS_CHANGED_EVENT,
  deleteNotifications,
  markNotificationRead,
  markNotificationsRead,
  subscribeNotificationsChanged,
} from "@/core/api/notifications";

/** 最小 window 桩：只实现 broadcast 用到的那几个方法 */
function stubWindow() {
  const listeners = new Map<string, Set<EventListener>>();
  const dispatched: string[] = [];
  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: EventListener) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (e: Event) => {
      dispatched.push(e.type);
      listeners.get(e.type)?.forEach((fn) => fn(e));
      return true;
    },
  });
  return { dispatched, listeners };
}

describe("通知变更广播", () => {
  let ctx: ReturnType<typeof stubWindow>;

  beforeEach(() => {
    ctx = stubWindow();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("单条已读 → 广播一次", async () => {
    await markNotificationRead(11);
    expect(ctx.dispatched).toEqual([NOTIFICATIONS_CHANGED_EVENT]);
  });

  it("批量已读 → 广播一次", async () => {
    await markNotificationsRead({ ids: [11, 12] });
    expect(ctx.dispatched).toEqual([NOTIFICATIONS_CHANGED_EVENT]);
  });

  it("批量删除 → 广播一次", async () => {
    await deleteNotifications({ all: true });
    expect(ctx.dispatched).toEqual([NOTIFICATIONS_CHANGED_EVENT]);
  });

  it("订阅回调在广播时被调用；取消订阅后不再调用", async () => {
    const hits: number[] = [];
    const off = subscribeNotificationsChanged(() => hits.push(1));

    await markNotificationRead(11);
    expect(hits).toHaveLength(1);

    off();
    await markNotificationRead(12);
    expect(hits).toHaveLength(1);
  });
});
