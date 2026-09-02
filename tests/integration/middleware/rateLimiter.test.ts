import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";
import {
  createRateLimiter,
  checkRateLimit,
  getRateLimitPersistDir,
  type RateLimiterConfig,
} from "@/lib/middleware/rateLimiter";

const baseConfig: RateLimiterConfig = {
  windowMs: 60_000,
  maxAttempts: 5,
};

describe("createRateLimiter", () => {
  beforeEach(() => {
    // 清理全局 rate limiter map
    (globalThis as any)._rlMap = undefined;
  });

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

  it("supportLastSentAt → 间隔已过 → minInterval 不再阻塞（落入计数检查）", () => {
    const limiter = createRateLimiter({
      ...baseConfig,
      maxAttempts: 5,
      supportLastSentAt: true,
      minIntervalMs: 60_000,
    });
    limiter.record("test-key");
    // 回拨 lastSentAt，模拟距上次发送已超过 minInterval
    const map = (globalThis as unknown as { _rlMap: Map<string, { lastSentAt?: number }> })._rlMap;
    map.get("test-key")!.lastSentAt = Date.now() - 2 * 60_000;
    const result = limiter.check("test-key");
    expect(result.blocked).toBe(false);
  });

  it("check 命中已过期条目 → 重置窗口", () => {
    (globalThis as unknown as { _rlMap: Map<string, { count: number; resetAt: number }> })._rlMap =
      new Map([["expired-key", { count: 99, resetAt: Date.now() - 1 }]]);
    const limiter = createRateLimiter(baseConfig);
    const result = limiter.check("expired-key");
    expect(result.blocked).toBe(false);
  });

  it("键空间达到 MAX_KEYS → 先清过期条目再容纳新键", () => {
    // 预置 10 万条已过期条目（模拟 XFF 伪造攻击填充）
    const map = new Map<string, { count: number; resetAt: number }>();
    for (let i = 0; i < 100_000; i++) {
      map.set(`fake-key-${i}`, { count: 1, resetAt: Date.now() - 1 });
    }
    (globalThis as unknown as { _rlMap: Map<string, { count: number; resetAt: number }> })._rlMap =
      map;

    const limiter = createRateLimiter(baseConfig);
    const result = limiter.check("new-key");
    expect(result.blocked).toBe(false);
    // 过期条目被批量清理，新键已写入
    const after = (globalThis as unknown as { _rlMap: Map<string, unknown> })._rlMap;
    expect(after.has("new-key")).toBe(true);
    expect(after.size).toBeLessThan(100_000);
  });

  it("键空间满且全部未过期 → 丢弃最旧键容纳新键", () => {
    const map = new Map<string, { count: number; resetAt: number }>();
    for (let i = 0; i < 100_000; i++) {
      map.set(`fresh-key-${i}`, { count: 1, resetAt: Date.now() + 60_000 });
    }
    (globalThis as unknown as { _rlMap: Map<string, { count: number; resetAt: number }> })._rlMap =
      map;

    const limiter = createRateLimiter(baseConfig);
    expect(limiter.check("newest-key").blocked).toBe(false);
    const after = (globalThis as unknown as { _rlMap: Map<string, { count: number; resetAt: number }> })
      ._rlMap;
    expect(after.size).toBe(100_000); // 淘汰最旧后容量守恒
    expect(after.has("fresh-key-0")).toBe(false); // 最旧键被丢弃
    expect(after.has("newest-key")).toBe(true);
  });
});

// ── 持久化（persistFile）─────────────────────────────────────────────────────

describe("createRateLimiter 持久化", () => {
  let persistFile: string;

  beforeEach(() => {
    (globalThis as unknown as { _rlMap?: unknown })._rlMap = undefined;
    persistFile = path.join(os.tmpdir(), `rl-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  });

  afterEach(() => {
    try {
      fs.rmSync(persistFile, { force: true });
    } catch {
      /* ignore */
    }
  });

  it("启动时从文件恢复未过期条目，过期条目被忽略", () => {
    fs.writeFileSync(
      persistFile,
      JSON.stringify({
        "restored-key": { count: 3, resetAt: Date.now() + 60_000 },
        "stale-key": { count: 3, resetAt: Date.now() - 1000 },
      }),
      "utf-8",
    );
    const limiter = createRateLimiter({ windowMs: 60_000, maxAttempts: 3, persistFile });
    // 未过期条目已恢复：计数 3/3 → 阻塞
    expect(limiter.check("restored-key").blocked).toBe(true);
    // 过期条目未恢复：重新计数
    expect(limiter.check("stale-key").blocked).toBe(false);
  });

  it("损坏的持久化文件 → 静默忽略，限流器正常工作", () => {
    fs.writeFileSync(persistFile, "{invalid json", "utf-8");
    const limiter = createRateLimiter({ windowMs: 60_000, maxAttempts: 3, persistFile });
    expect(limiter.check("any-key").blocked).toBe(false);
  });

  it("record 触发 persist 写入；清空后 persist 删除文件", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxAttempts: 3, persistFile });
    limiter.record("persisted-key");
    expect(fs.existsSync(persistFile)).toBe(true);
    expect(fs.readFileSync(persistFile, "utf-8")).toContain("persisted-key");

    limiter.clear("persisted-key");
    expect(fs.existsSync(persistFile)).toBe(false); // 空状态 → 文件被清理
  });

  it("无 persistFile → persist 为 no-op", () => {
    const limiter = createRateLimiter(baseConfig);
    expect(() => limiter.persist()).not.toThrow();
  });

  it("cleanupIntervalMs 定时清理过期条目", async () => {
    const limiter = createRateLimiter({ ...baseConfig, cleanupIntervalMs: 15 });
    limiter.record("to-be-cleaned");
    // 回拨 resetAt 使其过期
    const map = (globalThis as unknown as { _rlMap: Map<string, { resetAt: number }> })._rlMap;
    map.get("to-be-cleaned")!.resetAt = Date.now() - 1;

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(map.has("to-be-cleaned")).toBe(false);
  });
});

// ── checkRateLimit 守卫 ──────────────────────────────────────────────────────

describe("checkRateLimit", () => {
  beforeEach(() => {
    (globalThis as unknown as { _rlMap?: unknown })._rlMap = undefined;
  });

  afterEach(() => {
    (globalThis as unknown as { _rlMap?: unknown })._rlMap = undefined;
  });

  const req = () => new NextRequest("http://localhost:3000/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

  it("未超限 → 返回 null 放行并计数", () => {
    const result = checkRateLimit(req(), { windowMs: 60_000, maxAttempts: 2 });
    expect(result).toBeNull();
  });

  it("超限（默认 IP 键）→ 429 响应 + Retry-After 头", () => {
    const config = { windowMs: 60_000, maxAttempts: 1 };
    expect(checkRateLimit(req(), config)).toBeNull();
    const blocked = checkRateLimit(req(), config);
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(Number(blocked!.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("自定义 keyFn → 按自定义键限流", async () => {
    const config = { windowMs: 60_000, maxAttempts: 1 };
    const reqWithAccount = () =>
      new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: { "x-account": "user-1" },
      });
    const keyFn = (r: NextRequest) => `acct:${r.headers.get("x-account")}`;
    expect(checkRateLimit(reqWithAccount(), config, keyFn)).toBeNull();
    const blocked = checkRateLimit(reqWithAccount(), config, keyFn);
    expect(blocked!.status).toBe(429);
    await expect(blocked!.json()).resolves.toMatchObject({ code: 42001 });
  });
});

// ── getRateLimitPersistDir ───────────────────────────────────────────────────

describe("getRateLimitPersistDir", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("非生产环境 → 项目 logs 目录", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(getRateLimitPersistDir()).toBe(path.join(process.cwd(), "logs", "rate-limit"));
  });

  it("生产环境 → 容器内固定目录", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getRateLimitPersistDir()).toBe("/app/logs/rate-limit");
  });
});
