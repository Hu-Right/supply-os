/**
 * server/services/ 其余服务文件测试
 * 覆盖 reportCacheCleanup.ts（nextMonthlyRunAt）, notice-actions.ts（错误类）,
 *       translation/fetchWithTimeout.ts
 */
import { describe, it, expect, vi } from "vitest";

// ── reportCacheCleanup ──
import { nextMonthlyRunAt } from "../../../server/services/reportCacheCleanup";

describe("nextMonthlyRunAt", () => {
  it("当月 1 号 8 点前 → 返回当月 1 号 8 点", () => {
    const now = new Date(2026, 7, 1, 3, 0, 0); // 8月1号 3:00
    const next = nextMonthlyRunAt(now);
    expect(next.getMonth()).toBe(7); // 8月
    expect(next.getDate()).toBe(1);
    expect(next.getHours()).toBe(8);
  });

  it("当月 1 号 8 点后 → 返回下月 1 号 8 点", () => {
    const now = new Date(2026, 7, 1, 10, 0, 0); // 8月1号 10:00
    const next = nextMonthlyRunAt(now);
    expect(next.getMonth()).toBe(8); // 9月
    expect(next.getDate()).toBe(1);
    expect(next.getHours()).toBe(8);
  });

  it("月中 → 返回下月 1 号 8 点", () => {
    const now = new Date(2026, 7, 15, 12, 0, 0); // 8月15号
    const next = nextMonthlyRunAt(now);
    expect(next.getMonth()).toBe(8); // 9月
    expect(next.getDate()).toBe(1);
  });

  it("12 月 → 次年 1 月", () => {
    const now = new Date(2026, 11, 15); // 12月15号
    const next = nextMonthlyRunAt(now);
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0); // 1月
    expect(next.getDate()).toBe(1);
  });
});

// ── notice-actions 错误类 ──
import { NoticeNotFoundError, QuotaExceededError } from "../../../server/services/notice-actions";

describe("NoticeNotFoundError", () => {
  it("正确实例化", () => {
    const err = new NoticeNotFoundError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("NoticeNotFoundError");
    expect(err.message).toBe("Notice not found");
  });
});

describe("QuotaExceededError", () => {
  it("携带 code", () => {
    const err = new QuotaExceededError("FREE_LIMIT_REACHED");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("QuotaExceededError");
    expect(err.code).toBe("FREE_LIMIT_REACHED");
    expect(err.message).toBe("FREE_LIMIT_REACHED");
  });
});

// ── translation/fetchWithTimeout ──
import { fetchWithTimeout } from "../../../server/services/translation/fetchWithTimeout";

describe("fetchWithTimeout", () => {
  it("超时抛出 CHANNEL_TIMEOUT", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as any; // never resolves

    try {
      await expect(fetchWithTimeout("http://test.com", {}, 50))
        .rejects.toThrow("CHANNEL_TIMEOUT");
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 10000);

  it("正常响应直接返回", async () => {
    const mockResponse = { ok: true, status: 200 };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => Promise.resolve(mockResponse as Response));

    try {
      const res = await fetchWithTimeout("http://test.com", {}, 5000);
      expect(res.ok).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
