import { describe, it, expect, vi } from "vitest";
import { fetchWithTimeout, assertPublicHttpUrl } from "./fetchWithTimeout";

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

describe("assertPublicHttpUrl（SSRF 防护）", () => {
  it.each([
    "https://api.deepseek.com/chat/completions",
    "http://example.com",
  ])("公网地址放行: %s", (url) => {
    expect(() => assertPublicHttpUrl(url)).not.toThrow();
  });

  it.each([
    "http://localhost/api",
    "http://localhost:8080/api",
    "http://sub.localhost/api",
    "http://127.0.0.1/api",
    "http://127.0.0.1:3000/api",
    "http://10.0.0.5/api",
    "http://192.168.1.10/api",
    "http://172.16.0.1/api",
    "http://172.31.255.255/api",
    "http://169.254.169.254/latest/meta-data",
    "http://0.0.0.0/api",
    "http://[::1]/api",
    "http://[fd00::1]/api",
    "http://[fe80::1]/api",
    "http://2130706433/api",
    "ftp://example.com/file",
    "file:///etc/passwd",
    "not-a-url",
  ])("内网/保留地址/非法协议拒绝: %s", (url) => {
    expect(() => assertPublicHttpUrl(url)).toThrow();
  });

  it("fetchWithTimeout 对内网 URL 在发起请求前即拒绝", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      fetchWithTimeout("http://169.254.169.254/latest/meta-data", {}, 1000)
    ).rejects.toThrow("CHANNEL_URL_BLOCKED");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
