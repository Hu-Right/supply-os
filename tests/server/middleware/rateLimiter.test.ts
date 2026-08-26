/**
 * server/middleware/rateLimiter.ts 测试
 * 验证速率限制器工厂逻辑
 */
import { describe, it, expect, vi } from "vitest";
import { createRateLimiter } from "../../../server/middleware/rateLimiter";

describe("createRateLimiter", () => {
  it("首次 check → 不限制", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxAttempts: 5 });
    expect(limiter.check("user1").blocked).toBe(false);
  });

  it("超过 maxAttempts → 限制", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxAttempts: 3 });
    limiter.record("user1");
    limiter.record("user1");
    limiter.record("user1");
    expect(limiter.check("user1").blocked).toBe(true);
  });

  it("clear → 重置计数", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxAttempts: 2 });
    limiter.record("user1");
    limiter.record("user1");
    expect(limiter.check("user1").blocked).toBe(true);
    limiter.clear("user1");
    expect(limiter.check("user1").blocked).toBe(false);
  });

  it("不同 key 独立计数", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxAttempts: 2 });
    limiter.record("user1");
    limiter.record("user1");
    expect(limiter.check("user1").blocked).toBe(true);
    expect(limiter.check("user2").blocked).toBe(false);
  });

  it("retryAfterSec > 0 当被限制时", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxAttempts: 1 });
    limiter.record("user1");
    const result = limiter.check("user1");
    expect(result.blocked).toBe(true);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it("supportLastSentAt → 间隔检查", () => {
    const limiter = createRateLimiter({
      windowMs: 60000, maxAttempts: 10,
      supportLastSentAt: true, minIntervalMs: 60000,
    });
    limiter.record("phone1");
    // 立即再次 check → 应被间隔限制
    const result = limiter.check("phone1");
    expect(result.blocked).toBe(true);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it("persist 不抛出异常（无 persistFile）", () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxAttempts: 5 });
    expect(() => limiter.persist()).not.toThrow();
  });
});
