/**
 * server/services — reportCacheCleanup + agencyAliasSeed 测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── reportCacheCleanup ────────────────────────────────────────────────────────
import { nextMonthlyRunAt, clearReportCache, clearExpiredTranslations } from "../../../server/services/reportCacheCleanup";

describe("nextMonthlyRunAt", () => {
  it("当月 1 号 8 点之前 → 返回当月 1 号 8 点", () => {
    const now = new Date(2026, 7, 1, 6, 0, 0); // 8 月 1 号 6:00
    const result = nextMonthlyRunAt(now);
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(7); // 8 月
    expect(result.getHours()).toBe(8);
  });

  it("当月 1 号 8 点之后 → 返回下月 1 号 8 点", () => {
    const now = new Date(2026, 7, 1, 10, 0, 0); // 8 月 1 号 10:00
    const result = nextMonthlyRunAt(now);
    expect(result.getMonth()).toBe(8); // 9 月
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(8);
  });

  it("月中 → 返回下月 1 号 8 点", () => {
    const now = new Date(2026, 7, 15, 12, 0, 0); // 8 月 15 号
    const result = nextMonthlyRunAt(now);
    expect(result.getMonth()).toBe(8); // 9 月
    expect(result.getDate()).toBe(1);
  });

  it("12 月月中 → 返回次年 1 月 1 号", () => {
    const now = new Date(2026, 11, 15); // 12 月 15 号
    const result = nextMonthlyRunAt(now);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0); // 1 月
    expect(result.getDate()).toBe(1);
  });
});

describe("clearReportCache", () => {
  it("目录不存在返回 0", async () => {
    const result = await clearReportCache("/nonexistent/path/xyz");
    expect(result).toBe(0);
  });
});

describe("clearExpiredTranslations", () => {
  it("返回 notices + opportunities 删除行数", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce([{ affectedRows: 5 }])  // notices
        .mockResolvedValueOnce([{ affectedRows: 3 }]),  // opportunities
    };
    const result = await clearExpiredTranslations(mockPool as any);
    expect(result.notices).toBe(5);
    expect(result.opportunities).toBe(3);
  });

  it("affectedRows 缺失返回 0", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}]),
    };
    const result = await clearExpiredTranslations(mockPool as any);
    expect(result.notices).toBe(0);
    expect(result.opportunities).toBe(0);
  });
});

// ── agencyAliasSeed ───────────────────────────────────────────────────────────
import { seedAgencyAliases } from "../../../server/services/agencyAliasSeed";

describe("seedAgencyAliases", () => {
  it("将种子数据写入数据库并返回写入行数", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    };

    const total = await seedAgencyAliases(mockPool);

    expect(mockPool.query).toHaveBeenCalled();
    expect(typeof total).toBe("number");
    expect(total).toBeGreaterThanOrEqual(0);
  });

  it("affectedRows 为 0 时计数为 0", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([{ affectedRows: 0 }]),
    };

    const total = await seedAgencyAliases(mockPool);
    expect(total).toBe(0);
  });
});
