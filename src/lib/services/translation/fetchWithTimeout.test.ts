import { describe, it, expect, vi } from "vitest";
import { fetchWithTimeout } from "./fetchWithTimeout";

describe("fetchWithTimeout", () => {
  it("正常响应 → 返回 Response", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const res = await fetchWithTimeout("http://example.com", {}, 5000);
    expect(res.status).toBe(200);
    vi.restoreAllMocks();
  });

  it("超时 → 抛出 CHANNEL_TIMEOUT", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const promise = fetchWithTimeout("http://example.com", {}, 100);
    vi.advanceTimersByTime(200);

    await expect(promise).rejects.toThrow("CHANNEL_TIMEOUT");
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
