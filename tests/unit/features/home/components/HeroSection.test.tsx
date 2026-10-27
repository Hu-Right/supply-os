import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// HeroSection 热门标签的路由口径测试：
// 品类大类 → ?commodity=<L1 码>（检索侧品目谓词），国家 → ?country=<canonical>（ISO2 谓词），
// 两者都不再降级为 ?q=<文本> 全文关键词（2026-10-22 修复的根因）。

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// hook 走 apiCached，桩这一层即可让真实的 hotGroupView（码→链接共用口径）参与断言
const { apiCachedMock } = vi.hoisted(() => ({ apiCachedMock: vi.fn() }));
vi.mock("@/core/http", () => ({
  apiCached: (...args: unknown[]) => apiCachedMock(...args),
}));

// 展示名映射真实表靠 /api/catalog/country-name-map 运行时装载，jsdom 下为空；
// 本测试钉的是「URL 携带 canonical、展示走本地化名」的分离口径，静态桩即可
vi.mock("@/shared/data/countryNames", () => ({
  getCountryDisplayName: (name: string) =>
    (({ Brazil: "巴西", Spain: "西班牙", "Bosnia and Herzegovina": "波斯尼亚和黑塞哥维那" }) as Record<string, string>)[name] ?? name,
}));

import { HeroSection } from "@/features/home/components/HeroSection";

/** 服务端真实形制：countries=canonical 名，industries=L1 树码 + 树名 */
const mockTopics = {
  countries: [
    { country: "Brazil", count: 100 },
    { country: "Spain", count: 90 },
  ],
  industries: [
    { code: "UGT-01", nameZh: "工商管理与行政服务", count: 80 },
    { code: "UGT-02", nameZh: "建筑施工与运维服务", count: 70 },
  ],
};

/** 热门区里的标签按钮（排除「搜索商机」按钮：它不带标签文案） */
function tagButton(label: string): HTMLElement {
  return screen.getByRole("button", { name: label });
}

describe("HeroSection 热门标签点击路由", () => {
  afterEach(() => {
    pushMock.mockReset();
    apiCachedMock.mockReset();
  });

  it("品类大类标签点击走 ?commodity=<L1 码> 筛选谓词，而不是 ?q= 关键词", async () => {
    apiCachedMock.mockResolvedValue(mockTopics);
    render(<HeroSection />);

    await waitFor(() => expect(tagButton("工商管理与行政服务")).toBeTruthy());
    fireEvent.click(tagButton("工商管理与行政服务"));

    expect(pushMock).toHaveBeenCalledWith("/procurement?commodity=UGT-01");
    // 同一次点击不得再产生任何 ?q= 跳转（旧行为的直接症状）
    for (const call of pushMock.mock.calls) {
      expect(String(call[0])).not.toMatch(/[?&]q=/);
    }
  });

  it("国家标签点击走 ?country=<canonical>（URL 携带 canonical，展示名与筛选值分离）", async () => {
    apiCachedMock.mockResolvedValue(mockTopics);
    render(<HeroSection />);

    await waitFor(() => expect(tagButton("巴西")).toBeTruthy());
    fireEvent.click(tagButton("巴西"));

    expect(pushMock).toHaveBeenCalledWith(`/procurement?country=${encodeURIComponent("Brazil")}`);
  });

  it("含逗号/空格的 canonical 必须经 URL 编码，不破坏查询串", async () => {
    apiCachedMock.mockResolvedValue({
      countries: [{ country: "Bosnia and Herzegovina", count: 10 }],
      industries: [],
    });
    render(<HeroSection />);

    await waitFor(() => expect(screen.queryByRole("button", { name: "波斯尼亚和黑塞哥维那" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "波斯尼亚和黑塞哥维那" }));

    const href = pushMock.mock.calls[0][0] as string;
    expect(href).toBe(`/procurement?country=${encodeURIComponent("Bosnia and Herzegovina")}`);
    // 编码后整个 URL 只允许一个 ? 与一个 =（值内的特殊字符不得泄漏为分隔符）
    expect(href.split("?")).toHaveLength(2);
    expect(href.slice(href.indexOf("?")).split("=")).toHaveLength(2);
  });

  it("数据未返回时的兜底国家标签仍可点，保持关键词搜索（无 canonical 可筛，诚实降级）", () => {
    apiCachedMock.mockReturnValue(new Promise(() => {})); // 永挂起 = topics 恒 null
    render(<HeroSection />);

    fireEvent.click(tagButton("肯尼亚"));

    expect(pushMock).toHaveBeenCalledWith(`/procurement?q=${encodeURIComponent("肯尼亚")}`);
  });

  it("点击品类标签不回填搜索框：筛选态与关键词态不互相污染", async () => {
    apiCachedMock.mockResolvedValue(mockTopics);
    render(<HeroSection />);

    await waitFor(() => expect(tagButton("建筑施工与运维服务")).toBeTruthy());
    fireEvent.click(tagButton("建筑施工与运维服务"));

    expect(pushMock).toHaveBeenCalledWith("/procurement?commodity=UGT-02");
    expect((screen.getByPlaceholderText("homeSearchPlaceholder") as HTMLInputElement).value).toBe("");
  });

  it("手动输入仍走 ?q= 关键词搜索（本次修复不改变自由文本入口）", async () => {
    apiCachedMock.mockResolvedValue(mockTopics);
    render(<HeroSection />);
    await waitFor(() => expect(tagButton("巴西")).toBeTruthy());

    const input = screen.getByPlaceholderText("homeSearchPlaceholder") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "太阳能" } });
    fireEvent.click(screen.getByRole("button", { name: "homeSearchBtn" }));

    expect(pushMock).toHaveBeenCalledWith(`/procurement?q=${encodeURIComponent("太阳能")}`);
  });
});
