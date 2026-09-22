import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiCached, clearApiCache, getCachedData, setCachedData } from "@/core/http/api-client";

vi.mock("@/core/perf", () => ({ recordApiMetric: vi.fn() }));

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: (data: unknown) => resolve(Response.json(data)),
    reject,
  };
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  clearApiCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  clearApiCache();
  vi.unstubAllGlobals();
});

describe("apiCached 强制刷新与请求隔离", () => {
  it("普通请求复用有效缓存", async () => {
    setCachedData("/api/cache-hit", { version: 1 });
    await expect(apiCached("/api/cache-hit")).resolves.toEqual({ version: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("普通并发请求只发起一次 fetch", async () => {
    const response = deferredResponse();
    fetchMock.mockReturnValueOnce(response.promise);
    const first = apiCached("/api/deduplicate");
    const second = apiCached("/api/deduplicate");
    response.resolve({ version: 1 });
    await expect(Promise.all([first, second])).resolves.toEqual([{ version: 1 }, { version: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("force 跳过已完成的缓存", async () => {
    setCachedData("/api/force-cache", { version: 1 });
    fetchMock.mockResolvedValueOnce(Response.json({ version: 2 }));
    await expect(apiCached("/api/force-cache", undefined, undefined, true)).resolves.toEqual({ version: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("force 不复用仍未完成的旧请求", async () => {
    const oldResponse = deferredResponse();
    const freshResponse = deferredResponse();
    fetchMock.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(freshResponse.promise);
    const oldRequest = apiCached("/api/force-pending");
    const freshRequest = apiCached("/api/force-pending", undefined, undefined, true);
    oldResponse.resolve({ version: 1 });
    freshResponse.resolve({ version: 2 });
    const results = await Promise.all([oldRequest, freshRequest]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toEqual([{ version: 1 }, { version: 2 }]);
  });

  it("强制刷新完成后，晚到的旧响应不能覆盖新缓存", async () => {
    const oldResponse = deferredResponse();
    const freshResponse = deferredResponse();
    fetchMock.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(freshResponse.promise);
    const oldRequest = apiCached("/api/force-latest");
    const freshRequest = apiCached("/api/force-latest", undefined, undefined, true);
    try {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      freshResponse.resolve({ version: 2 });
      await freshRequest;
    } finally {
      oldResponse.resolve({ version: 1 });
      freshResponse.resolve({ version: 2 });
      await Promise.all([oldRequest, freshRequest]);
    }
    expect(getCachedData("/api/force-latest")).toEqual({ version: 2 });
  });

  it.each(["成功", "失败"])("旧请求%s不应清除仍在进行的强制刷新", async (outcome) => {
    const oldResponse = deferredResponse();
    const freshResponse = deferredResponse();
    fetchMock.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(freshResponse.promise);
    const endpoint = `/api/force-cleanup-${outcome}`;
    const oldRequest = apiCached(endpoint).catch((error: unknown) => error);
    const freshRequest = apiCached(endpoint, undefined, undefined, true);
    let follower: Promise<unknown> | undefined;
    try {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      if (outcome === "成功") oldResponse.resolve({ version: 1 });
      else oldResponse.reject(new Error("旧请求失败"));
      await oldRequest;
      follower = apiCached(endpoint);
      freshResponse.resolve({ version: 2 });
      await expect(follower).resolves.toEqual({ version: 2 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      oldResponse.resolve({ version: 1 });
      freshResponse.resolve({ version: 2 });
      await Promise.allSettled([oldRequest, freshRequest, follower]);
    }
  });

  it("带 signal 的请求独立执行，不清除普通请求的复用记录", async () => {
    const sharedResponse = deferredResponse();
    const isolatedResponse = deferredResponse();
    fetchMock.mockReturnValueOnce(sharedResponse.promise).mockReturnValueOnce(isolatedResponse.promise);
    const shared = apiCached("/api/signal-isolation");
    const controller = new AbortController();
    const isolated = apiCached("/api/signal-isolation", undefined, controller.signal);
    isolatedResponse.resolve({ version: 1 });
    await isolated;
    clearApiCache();
    const follower = apiCached("/api/signal-isolation");
    sharedResponse.resolve({ version: 2 });
    const results = await Promise.allSettled([shared, follower]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      { status: "fulfilled", value: { version: 2 } },
      { status: "fulfilled", value: { version: 2 } },
    ]);
    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBe(controller.signal);
  });
});
