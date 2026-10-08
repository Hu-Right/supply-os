/**
 * 启动期数据库就绪等待 — 单元测试
 *
 * 覆盖 2026-10-08 事故的根治逻辑：服务器开机时 mysqld 仍在 InnoDB crash recovery、
 * 3306 尚未 bind，应用必须退避重试而不是撞一次就放弃启动。
 */
import { describe, expect, it } from "vitest";
import { waitForDatabase, type Pingable } from "@/lib/lifecycle/db-readiness";

/** 造一个「前 failTimes 次失败、之后成功」的连接池替身 */
function makePool(
  failTimes: number,
  message = "connect ECONNREFUSED 127.0.0.1:3306",
): { pool: Pingable; calls: () => number } {
  let n = 0;
  return {
    calls: () => n,
    pool: {
      async query() {
        n += 1;
        if (n <= failTimes) throw new Error(message);
        return [[{ "1": 1 }], []];
      },
    },
  };
}

/** 虚拟时钟 + 记录退避序列，避免单测真的等待 */
function makeFakeClock() {
  let t = 0;
  const delays: number[] = [];
  return {
    delays,
    now: () => t,
    sleep: async (ms: number) => {
      delays.push(ms);
      t += ms;
    },
  };
}

describe("waitForDatabase", () => {
  it("数据库立刻就绪：一次探测成功，完全不等待", async () => {
    const clock = makeFakeClock();
    const { pool } = makePool(0);

    const out = await waitForDatabase(pool, { now: clock.now, sleep: clock.sleep });

    expect(out).toMatchObject({ ok: true, attempts: 1, waitedMs: 0, lastError: "" });
    expect(clock.delays).toEqual([]);
  });

  it("开机竞态：前 3 次 ECONNREFUSED 后自动恢复，不放弃启动", async () => {
    const clock = makeFakeClock();
    const { pool, calls } = makePool(3);
    const seenAttempts: number[] = [];

    const out = await waitForDatabase(pool, {
      now: clock.now,
      sleep: clock.sleep,
      onWait: ({ attempt, reason }) => {
        seenAttempts.push(attempt);
        expect(reason).toContain("ECONNREFUSED");
      },
    });

    expect(out.ok).toBe(true);
    expect(out.attempts).toBe(4);
    expect(calls()).toBe(4);
    expect(seenAttempts).toEqual([1, 2, 3]);
  });

  it("退避按指数增长并封顶在 maxDelayMs，不对恢复中的 mysqld 高频空转", async () => {
    const clock = makeFakeClock();
    const { pool } = makePool(10);

    const out = await waitForDatabase(pool, {
      now: clock.now,
      sleep: clock.sleep,
      baseDelayMs: 500,
      maxDelayMs: 2000,
      timeoutMs: 100000,
    });

    expect(out.ok).toBe(true);
    expect(clock.delays.slice(0, 4)).toEqual([500, 1000, 2000, 2000]);
    expect(Math.max(...clock.delays)).toBe(2000);
  });

  it("预算耗尽：返回 ok=false 并保留最后一次失败原因，不无限重试", async () => {
    const clock = makeFakeClock();
    const { pool, calls } = makePool(999);

    const out = await waitForDatabase(pool, {
      now: clock.now,
      sleep: clock.sleep,
      timeoutMs: 4000,
      baseDelayMs: 500,
      maxDelayMs: 2000,
    });

    expect(out.ok).toBe(false);
    expect(out.budgetMs).toBe(4000);
    expect(out.lastError).toContain("ECONNREFUSED");
    // 退避 500→1000→2000→2000，累计 5500ms 时第 5 次探测已超预算即停
    expect(out.attempts).toBe(5);
    expect(calls()).toBe(5);
  });

  it("成功时清空 lastError，避免把历史失败原因带进启动日志", async () => {
    const clock = makeFakeClock();
    const { pool } = makePool(2);

    const out = await waitForDatabase(pool, { now: clock.now, sleep: clock.sleep });

    expect(out.ok).toBe(true);
    expect(out.lastError).toBe("");
  });
});
