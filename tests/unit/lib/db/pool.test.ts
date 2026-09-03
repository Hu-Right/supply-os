import { describe, it, expect, vi, beforeEach } from "vitest";

const createPool = vi.fn((..._args: unknown[]) => ({ fakePool: true }));

vi.mock("server-only", () => ({}));

vi.mock("mysql2/promise", () => ({
  default: {
    createPool: (...args: unknown[]) => createPool(...args),
  },
}));

describe("getPool 连接池单例", () => {
  beforeEach(() => {
    vi.resetModules();
    createPool.mockClear();
    (globalThis as unknown as { _pool?: unknown })._pool = undefined;
  });

  it("多次调用返回同一实例，且只创建一次连接池", async () => {
    const { getPool } = await import("@/lib/db/pool");
    const a = getPool();
    const b = getPool();
    const c = getPool();
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(createPool).toHaveBeenCalledTimes(1);
  });

  it("清除全局缓存后才会重建连接池（热重载场景）", async () => {
    const { getPool } = await import("@/lib/db/pool");
    const first = getPool();
    (globalThis as unknown as { _pool?: unknown })._pool = undefined;
    const second = getPool();
    expect(second).not.toBe(first);
    expect(createPool).toHaveBeenCalledTimes(2);
  });
});
