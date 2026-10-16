/**
 * getNoticeDailyNew（今日/昨日同期新增）回归测试
 *
 * 该函数是 2026-10 从 /api/notices/stats 路由下沉到 lib/services 的，
 * stats.ts 在覆盖率白名单内；切窗算法必须钉死：
 * - 北京时间自然日 00:00 切分（UTC+8），今日窗口 [00:00, 次日00:00)；
 * - 昨日取「已流逝等长」同期窗口，保证环比可比；
 * - 空结果回退 0。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStatsCache, getNoticeDailyNew } from "@/lib/services/notice-search/stats";

const queryMock = vi.fn();
const pool = { query: queryMock } as never;

beforeEach(() => {
  vi.useFakeTimers();
  clearStatsCache();
  queryMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function beijingUnix(dateStr: string, hour = 0): number {
  return Math.floor(new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00+08:00`).getTime() / 1000);
}

describe("getNoticeDailyNew", () => {
  it("按北京时间自然日切窗，昨日取与今日已流逝等长的同期窗口", async () => {
    // 2026-10-16T02:00:00Z = 北京时间 10:00 → 今日 2026-10-16，已流逝 10h
    vi.setSystemTime(new Date("2026-10-16T02:00:00Z"));
    queryMock
      .mockResolvedValueOnce([[{ total: 12 }]]) // 今日窗口
      .mockResolvedValueOnce([[{ total: 9 }]]); // 昨日同期

    const result = await getNoticeDailyNew(pool);
    expect(result).toEqual({ todayNew: 12, yesterdayNew: 9 });

    const todayStart = beijingUnix("2026-10-16", 0);
    const todayEnd = beijingUnix("2026-10-17", 0);
    const elapsed = Math.floor(Date.now() / 1000) - todayStart; // 10h = 36000s
    expect(queryMock.mock.calls[0][1]).toEqual([todayStart, todayEnd]);
    expect(queryMock.mock.calls[1][1]).toEqual([todayStart - 86400, todayStart - 86400 + elapsed]);
    expect(elapsed).toBe(10 * 3600);
  });

  it("行集为空时回退 0，不返回 undefined", async () => {
    queryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([[]]);
    await expect(getNoticeDailyNew(pool)).resolves.toEqual({ todayNew: 0, yesterdayNew: 0 });
  });

  it("查询抛错直接向上传递（由调用方决定降级值）", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    await expect(getNoticeDailyNew(pool)).rejects.toThrow("boom");
  });
});
