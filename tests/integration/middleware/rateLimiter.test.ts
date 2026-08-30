import { describe, it, expect, beforeEach } from "vitest";
import { createRateLimiter, type RateLimiterConfig } from "@/lib/middleware/rateLimiter";

describe("createRateLimiter", () => {
  beforeEach(() => {
    // 清理全局 rate limiter map
    (globalThis as any)._rlMap = undefined;
  });

  const baseConfig: RateLimiterConfig = {
    windowMs: 60_000,
    maxAttempts: 5,
  };

  it("首次 check → 不阻塞", () => {
    const limiter = createRateLimiter(baseConfig);
    const result = limiter.check("test-key");
    expect(result.blocked).toBe(false);
    expect(result.retryAfterSec).toBe(0);
  });

  it("record 后 check → 计数增加", () => {
    const limiter = createRateLimiter(baseConfig);
    limiter.record("test-key");
    limiter.record("test-key");
    const result = limiter.check("test-key");
    expect(result.blocked).toBe(false);
  });

  it("超过 maxAttempts → 阻塞", () => {
    const limiter = createRateLimiter({ ...baseConfig, maxAttempts: 3 });
    limiter.record("test-key");
    limiter.record("test-key");
    limiter.record("test-key");
    const result = limiter.check("test-key");
    expect(result.blocked).toBe(true);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it("clear → 重置计数", () => {
    const limiter = createRateLimiter({ ...baseConfig, maxAttempts: 2 });
    limiter.record("test-key");
    limiter.record("test-key");
    expect(limiter.check("test-key").blocked).toBe(true);

    limiter.clear("test-key");
    expect(limiter.check("test-key").blocked).toBe(false);
  });

  it("不同 key 独立计数", () => {
    const limiter = createRateLimiter({ ...baseConfig, maxAttempts: 2 });
    limiter.record("key-a");
    limiter.record("key-a");
    expect(limiter.check("key-a").blocked).toBe(true);
    expect(limiter.check("key-b").blocked).toBe(false);
  });

  it("supportLastSentAt → 最小间隔限制", () => {
    const limiter = createRateLimiter({
      ...baseConfig,
      maxAttempts: 100,
      supportLastSentAt: true,
      minIntervalMs: 60_000,
    });
    limiter.record("test-key");
    // 立即再次 check → 应被 minInterval 阻塞
    const result = limiter.check("test-key");
    expect(result.blocked).toBe(true);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });
});
