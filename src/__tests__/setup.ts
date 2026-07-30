import "@testing-library/jest-dom";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./mocks/server";

// MSW: Start server before all tests, reset handlers after each, close after all
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// jsdom 无 IntersectionObserver：曝光埋点（ProcurementPage 隐式信号）依赖此 API，
// 提供空实现 stub，测试关注业务行为而非曝光观察本身
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
  root = null;
  rootMargin = "";
  thresholds = [];
}
vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
