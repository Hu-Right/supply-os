/**
 * src/core/http/api-client.ts 测试
 * 覆盖 Token 管理, ApiError, 缓存操作, api() 基础请求, apiCached() 缓存请求
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// mock 依赖
vi.mock("@/core/perf", () => ({
  recordApiMetric: vi.fn(),
}));

// 模拟 import.meta.env
vi.stubEnv("VITE_API_BASE_URL", "");

import {
  getAuthToken, setAuthTokens, clearAuthTokens, updateAuthToken,
  ApiError,
  api, apiCached,
  getCachedData, setCachedData, deleteCachedData, clearApiCache, getCachedTimestamp,
} from "@/core/http/api-client";

// ── Token 管理 ──
describe("Token 管理", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("getAuthToken 初始为空", () => {
    expect(getAuthToken()).toBeNull();
  });

  it("setAuthTokens 写入后可读取", () => {
    setAuthTokens("token-123");
    expect(getAuthToken()).toBe("token-123");
  });

  it("clearAuthTokens 清除 token", () => {
    setAuthTokens("token-456");
    clearAuthTokens();
    expect(getAuthToken()).toBeNull();
  });

  it("updateAuthToken 覆盖旧值", () => {
    setAuthTokens("old-token");
    updateAuthToken("new-token");
    expect(getAuthToken()).toBe("new-token");
  });
});

// ── ApiError ──
describe("ApiError", () => {
  it("携带 status 和 message", () => {
    const err = new ApiError(404, "Not Found");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not Found");
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });
});

// ── 缓存操作 ──
describe("缓存操作", () => {
  beforeEach(() => {
    clearApiCache();
  });

  it("setCachedData + getCachedData", () => {
    setCachedData("/api/test", { value: 42 });
    expect(getCachedData("/api/test")).toEqual({ value: 42 });
  });

  it("getCachedTimestamp 返回写入时间", () => {
    const before = Date.now();
    setCachedData("/api/ts-test", "data");
    const ts = getCachedTimestamp("/api/ts-test");
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now());
  });

  it("未设置的 key 返回 undefined / 0", () => {
    expect(getCachedData("/api/nonexistent")).toBeUndefined();
    expect(getCachedTimestamp("/api/nonexistent")).toBe(0);
  });

  it("deleteCachedData 删除指定 key", () => {
    setCachedData("/api/a", 1);
    setCachedData("/api/b", 2);
    deleteCachedData("/api/a");
    expect(getCachedData("/api/a")).toBeUndefined();
    expect(getCachedData("/api/b")).toBe(2);
  });

  it("clearApiCache 无参数清空全部", () => {
    setCachedData("/api/x", 1);
    setCachedData("/api/y", 2);
    clearApiCache();
    expect(getCachedData("/api/x")).toBeUndefined();
    expect(getCachedData("/api/y")).toBeUndefined();
  });

  it("clearApiCache 按 pattern 过滤", () => {
    setCachedData("/api/users/1", "a");
    setCachedData("/api/users/2", "b");
    setCachedData("/api/notices/1", "c");
    clearApiCache("/users");
    expect(getCachedData("/api/users/1")).toBeUndefined();
    expect(getCachedData("/api/notices/1")).toBe("c");
  });
});

// ── api() 请求 ──
describe("api()", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    window.localStorage.clear();
    clearApiCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET 请求成功返回 JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: "hello" }),
    });

    const result = await api<{ data: string }>("/api/test");
    expect(result.data).toBe("hello");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("POST 请求序列化 body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await api("/api/submit", { method: "POST", body: { name: "test" } });
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1].body).toBe(JSON.stringify({ name: "test" }));
    expect(callArgs[1].headers["Content-Type"]).toBe("application/json");
  });

  it("非 ok 响应抛出 ApiError", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal Error" }),
    });

    await expect(api("/api/fail")).rejects.toThrow(ApiError);
    await expect(api("/api/fail")).rejects.toMatchObject({ status: 500 });
  });

  it("自动附加 Authorization header", async () => {
    setAuthTokens("jwt-token-abc");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await api("/api/protected");
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer jwt-token-abc");
  });

  it("GET 请求不附加 Content-Type", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await api("/api/data");
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("完整 URL 直接使用", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await api("https://cdn.example.com/data.json");
    expect(fetchMock.mock.calls[0][0]).toBe("https://cdn.example.com/data.json");
  });
});

// ── api() 401 重试 ──
describe("api() 401 重试", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    window.localStorage.clear();
    clearApiCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("业务级 401（含 code）直接抛错不刷新", async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 401,
      json: async () => ({ code: "INVALID_CREDENTIALS", message: "Bad creds" }),
    });

    await expect(api("/api/login")).rejects.toThrow(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 无 refresh 调用
  });

  it("刷新成功 + 重试成功 → 返回数据", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: "new-tk" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: "refreshed" }) });

    const result = await api<{ data: string }>("/api/resource");
    expect(result.data).toBe("refreshed");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getAuthToken()).toBe("new-tk");
  });

  it("刷新成功但重试仍 401 → 清除 token + 抛错", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: "new-tk" }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });

    await expect(api("/api/resource")).rejects.toThrow(ApiError);
    expect(getAuthToken()).toBeNull();
  });

  it("刷新失败 → 清除 token + 抛 401", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) });

    await expect(api("/api/resource")).rejects.toThrow(ApiError);
    expect(getAuthToken()).toBeNull();
  });

  it("重试返回其他错误 → 抛出对应状态码", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: "new-tk" }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "Server Error" }) });

    await expect(api("/api/resource")).rejects.toThrow("Server Error");
  });
});

// ── apiCached() 去重与错误清理 ──
describe("apiCached() 去重与错误清理", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    window.localStorage.clear();
    clearApiCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("并发请求去重：只发一次网络请求", async () => {
    let resolveFetch: any;
    fetchMock.mockReturnValue(new Promise(() => { resolveFetch = null; }));
    fetchMock.mockReturnValueOnce(
      new Promise<any>((resolve) => { resolveFetch = resolve; }),
    );

    const p1 = apiCached("/api/dedup");
    const p2 = apiCached("/api/dedup");

    resolveFetch({ ok: true, status: 200, json: async () => ({ v: 1 }) });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ v: 1 });
    expect(r2).toEqual({ v: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("请求失败后清理 pending，下次重试", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ v: 2 }) });

    await expect(apiCached("/api/retry")).rejects.toThrow("network");
    const result = await apiCached<{ v: number }>("/api/retry");
    expect(result.v).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ── apiCached() ──
describe("apiCached()", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    window.localStorage.clear();
    clearApiCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("首次请求走网络", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [1, 2, 3] }),
    });

    const result = await apiCached<{ items: number[] }>("/api/items");
    expect(result.items).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("TTL 内再次请求命中缓存", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [1] }),
    });

    await apiCached("/api/cached-items", 60000);
    const result = await apiCached<{ items: number[] }>("/api/cached-items", 60000);
    expect(result.items).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 只调用一次
  });

  it("force=true 跳过缓存读取", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ v: 1 }),
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ v: 2 }),
    });

    await apiCached("/api/force-test", 60000);
    const result = await apiCached<{ v: number }>("/api/force-test", 60000, undefined, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
