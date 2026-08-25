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
