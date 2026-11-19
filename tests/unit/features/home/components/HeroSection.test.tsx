import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Hero 区口径（2026-11-18）：热门搜索只展示真实检索热度（/api/notices/hot-searches），
// mode=hot 才渲染标签；fallback/空列表整行隐藏；手工搜索仍走 /procurement?q=。
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const { apiCachedMock } = vi.hoisted(() => ({ apiCachedMock: vi.fn() }));
vi.mock("@/core/http", () => ({
  apiCached: (...args: unknown[]) => apiCachedMock(...args),
}));

import { HeroSection } from "@/features/home/components/HeroSection";

const hotData = {
  mode: "hot" as const,
  keywords: [
    { term: "solar", label: "太阳能", href: "/procurement?q=solar" },
    { term: "pump", label: "水泵", href: "/procurement?q=pump" },
  ],
};

afterEach(() => {
  pushMock.mockReset();
  apiCachedMock.mockReset();
});

describe("HeroSection 热门搜索（真实热度口径）", () => {
  it("mode=hot 渲染热词，点击按服务端 href 跳转，不自行拼 ?q=", async () => {
    apiCachedMock.mockResolvedValue(hotData);
    render(<HeroSection />);

    await waitFor(() => expect(screen.getByRole("button", { name: "太阳能" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "太阳能" }));

    expect(pushMock).toHaveBeenCalledWith("/procurement?q=solar");
    for (const call of pushMock.mock.calls) {
      expect(String(call[0])).toBe("/procurement?q=solar");
    }
  });

  it("mode=fallback 时整行隐藏（不拿数据覆盖榜冒充热门搜索）", async () => {
    apiCachedMock.mockResolvedValue({ mode: "fallback", keywords: hotData.keywords });
    render(<HeroSection />);

    await waitFor(() => expect(apiCachedMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "太阳能" })).toBeNull();
    expect(screen.queryByText("homeHotSearchLabel")).toBeNull();
  });

  it("热词为空时整行隐藏", async () => {
    apiCachedMock.mockResolvedValue({ mode: "hot", keywords: [] });
    render(<HeroSection />);

    await waitFor(() => expect(apiCachedMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("homeHotSearchLabel")).toBeNull();
  });

  it("接口失败静默隐藏，不产生未处理异常", async () => {
    apiCachedMock.mockRejectedValue(new Error("network down"));
    render(<HeroSection />);

    await waitFor(() => expect(apiCachedMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("homeHotSearchLabel")).toBeNull();
  });

  it("initialHotSearches 预渲染即可见（SSR 首屏）", () => {
    apiCachedMock.mockReturnValue(new Promise(() => {}));
    render(<HeroSection initialHotSearches={hotData} />);

    expect(screen.getByRole("button", { name: "水泵" })).toBeTruthy();
  });

  it("手动输入仍走 ?q= 自由文本搜索", async () => {
    apiCachedMock.mockResolvedValue({ mode: "fallback", keywords: [] });
    render(<HeroSection />);

    const input = screen.getByPlaceholderText("homeSearchPlaceholder") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "太阳能" } });
    fireEvent.click(screen.getByRole("button", { name: "homeSearchBtn" }));

    expect(pushMock).toHaveBeenCalledWith(`/procurement?q=${encodeURIComponent("太阳能")}`);
  });

  it("空输入提交落到搜索页默认列表", async () => {
    apiCachedMock.mockResolvedValue({ mode: "fallback", keywords: [] });
    render(<HeroSection />);

    fireEvent.click(screen.getByRole("button", { name: "homeSearchBtn" }));
    expect(pushMock).toHaveBeenCalledWith("/procurement");
  });
});