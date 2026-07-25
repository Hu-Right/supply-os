import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, apiCached, clearApiCache, getCachedData, setCachedData, deleteCachedData } from "@/core/http/api-client";

describe("api-client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearApiCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("api()", () => {
    it("should make successful API request", async () => {
      const mockData = { id: 1, name: "Test" };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await api("/api/test");
      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/test",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("should dispatch 401 event on unauthorized", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const dispatchSpy = vi.spyOn(window, "dispatchEvent");

      await expect(api("/api/test")).rejects.toThrow("Unauthorized");
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "supply-os:unauthorized",
        })
      );
    });

    it("should throw ApiError on non-ok response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Server error" }),
      });

      await expect(api("/api/test")).rejects.toThrow("Server error");
    });

    it("should serialize POST body as JSON", async () => {
      const mockData = { success: true };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const body = { name: "test", value: 42 };
      await api("/api/test", { method: "POST", body: body as any });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/test",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(body),
        })
      );
    });

    it("should pass custom headers", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await api("/api/test", { headers: { "X-Custom": "value" } });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/test",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Custom": "value",
          }),
        })
      );
    });

    it("should use absolute URL when endpoint starts with http", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await api("https://external.api.com/data");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://external.api.com/data",
        expect.any(Object)
      );
    });
  });

  describe("apiCached()", () => {
    it("should cache successful responses", async () => {
      const mockData = { id: 1, name: "Test" };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result1 = await apiCached("/api/test");
      const result2 = await apiCached("/api/test");

      expect(result1).toEqual(mockData);
      expect(result2).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should respect TTL expiration", async () => {
      const mockData1 = { id: 1 };
      const mockData2 = { id: 2 };

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(callCount === 1 ? mockData1 : mockData2),
        });
      });

      const result1 = await apiCached("/api/test", 100);
      expect(result1).toEqual(mockData1);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result2 = await apiCached("/api/test", 100);
      expect(result2).toEqual(mockData2);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("manual cache controls", () => {
    it("getCachedData / setCachedData / deleteCachedData work correctly", () => {
      // Initially empty
      expect(getCachedData("/manual")).toBeUndefined();

      // Set data
      setCachedData("/manual", { value: 42 });
      expect(getCachedData("/manual")).toEqual({ value: 42 });

      // Delete data
      deleteCachedData("/manual");
      expect(getCachedData("/manual")).toBeUndefined();
    });
  });

  describe("clearApiCache()", () => {
    it("should clear all cached data", async () => {
      const mockData = { id: 1 };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      await apiCached("/api/test1");
      await apiCached("/api/test2");

      clearApiCache();

      // Should fetch again after clearing cache
      await apiCached("/api/test1");
      await apiCached("/api/test2");

      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it("should clear cache by pattern", async () => {
      const mockData = { id: 1 };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      await apiCached("/api/users/1");
      await apiCached("/api/users/2");
      await apiCached("/api/products/1");

      clearApiCache("/users");

      // Users cache cleared, products cache still valid
      await apiCached("/api/users/1");
      await apiCached("/api/users/2");
      await apiCached("/api/products/1");

      expect(global.fetch).toHaveBeenCalledTimes(5); // 3 initial + 2 users refetch
    });
  });
});
