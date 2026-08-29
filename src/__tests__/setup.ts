/// <reference types="vitest/globals" />
/**
 * Vitest 全局 setup
 * Global test setup for unit & integration tests
 *
 * - 导入 @testing-library/jest-dom 扩展匹配器
 * - 提供全局 mock 工具（NextRequest、fetch 等）
 */
import "@testing-library/jest-dom";

// ── import.meta.env mock ─────────────────────────────────────────────────────
// Vitest 已原生支持 import.meta.env，无需额外 polyfill。
// 测试文件中可通过 vi.stubEnv() 临时覆盖环境变量。

// ── NextRequest mock helper ──────────────────────────────────────────────────
// 供 middleware / Route Handler 测试使用
export function mockNextRequest(
  url = "http://localhost:3000/api/test",
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
): Request {
  const headers = new Headers(init?.headers);
  return new Request(url, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
}

// ── fetch mock helper ────────────────────────────────────────────────────────
export function mockFetchResponse(data: unknown, status = 200): void {
  const json = typeof data === "string" ? () => Promise.resolve(data) : () => Promise.resolve(data);
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json,
    headers: new Headers(),
  });
}

// ── suppress noisy console in tests ──────────────────────────────────────────
if (process.env.SUPPRESS_CONSOLE !== "false") {
  // 保留 console.error / console.warn 以便排查失败用例
  // 仅抑制 console.log（避免测试输出过于嘈杂）
  vi.spyOn(console, "log").mockImplementation(() => {});
}
