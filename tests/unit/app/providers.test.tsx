/**
 * providers（客户端根壳）初始化行为回归
 *
 * 钉住 2026-10 架构评审 P0-3 的修复：AppInit 必须在挂载时调用
 * initPerfMonitor()，否则 core/perf 的 TTFB/FCP/LCP 采集链路整体休眠。
 * 重量级 Provider（i18n/auth/sonner/countryNames）全部以透传桩替换，
 * 本测试只验证「初始化调用 + children 渲染」。
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  initCountryNames: vi.fn(),
  initPerfMonitor: vi.fn(),
}));

vi.mock("@/core/i18n", () => ({
  LocaleProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/core/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/shared/ui/ErrorBoundary", () => ({
  ErrorBoundaryWithI18n: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("sonner", () => ({
  Toaster: () => null,
}));
vi.mock("@/shared/data/countryNames", () => ({
  initCountryNames: mocks.initCountryNames,
}));
vi.mock("@/core/perf", () => ({
  initPerfMonitor: mocks.initPerfMonitor,
}));

import Providers from "@/app/providers";

describe("Providers / AppInit", () => {
  it("挂载时一次性初始化国家名映射与 perf 采集，并渲染 children", () => {
    render(
      <Providers>
        <p>home-content</p>
      </Providers>,
    );

    expect(screen.getByText("home-content")).toBeInTheDocument();
    expect(mocks.initCountryNames).toHaveBeenCalledTimes(1);
    expect(mocks.initPerfMonitor).toHaveBeenCalledTimes(1);
  });
});
