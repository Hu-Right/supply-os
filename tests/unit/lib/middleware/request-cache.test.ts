/**
 * Request-scoped cache 测试
 *
 * @description 覆盖三件事：
 *  1. 不在作用域内（脚本/单测直接调 service）→ 直读 loader，不做任何缓存；
 *  2. 同一作用域内相同 key 只落一次，不同 key 各自独立；
 *  3. loader 失败不留下终态 —— 同请求内下一次调用可以重试。
 */
import { describe, it, expect, vi } from "vitest";
import { runWithRequestCache, memoizeRequest } from "@/lib/middleware/request-cache";

describe("memoizeRequest 无请求作用域", () => {
  it("直接调 service（无作用域）时每次都会执行 loader", async () => {
    const loader = vi.fn().mockResolvedValue("v");
    expect(await memoizeRequest("k", loader)).toBe("v");
    expect(await memoizeRequest("k", loader)).toBe("v");
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("memoizeRequest 请求作用域内", () => {
  it("同一 key 只执行一次 loader，结果被复用", async () => {
    const loader = vi.fn().mockResolvedValue("v");
    const [a, b] = await runWithRequestCache(async () => [
      await memoizeRequest("k", loader),
      await memoizeRequest("k", loader),
    ]);
    expect(a).toBe("v");
    expect(b).toBe("v");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("并发的同 key 调用共享同一个 pending promise", async () => {
    const loader = vi.fn().mockResolvedValue("v");
    const [a, b] = await runWithRequestCache(() =>
      Promise.all([memoizeRequest("k", loader), memoizeRequest("k", loader)]),
    );
    expect(a).toBe("v");
    expect(b).toBe("v");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("不同 key 互不干扰", async () => {
    const loader = vi.fn(async (v: unknown) => v);
    const result = await runWithRequestCache(async () => [
      await memoizeRequest("a", () => loader("A")),
      await memoizeRequest("b", () => loader("B")),
      await memoizeRequest("a", () => loader("A")),
    ]);
    expect(result).toEqual(["A", "B", "A"]);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("loader 失败不缓存终态：同作用域内可以重试成功", async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");
    const result = await runWithRequestCache(async () => {
      await expect(memoizeRequest("k", loader)).rejects.toThrow("boom");
      return memoizeRequest("k", loader);
    });
    expect(result).toBe("ok");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("作用域结束即失效：不同请求（不同作用域）不复用", async () => {
    const loader = vi.fn().mockResolvedValue("v");
    await runWithRequestCache(() => memoizeRequest("k", loader));
    await runWithRequestCache(() => memoizeRequest("k", loader));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("嵌套 runWithRequestCache 复用外层作用域（不另开缓存表）", async () => {
    const loader = vi.fn().mockResolvedValue("v");
    await runWithRequestCache(async () => {
      await memoizeRequest("k", loader);
      await runWithRequestCache(() => memoizeRequest("k", loader));
    });
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
