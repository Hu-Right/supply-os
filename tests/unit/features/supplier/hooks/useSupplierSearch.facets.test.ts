/**
 * useSupplierSearch 的行业主轴（facet）状态测试
 * @module tests/unit/features/supplier/hooks/useSupplierSearch.facets.test.ts
 * @description 钉住「骨架 chip 的判定依据」：facet 请求落定前后必须区分得开，
 *              而且**失败也算落定**。SearchPanel 一旦改用 `industrySections.length === 0`
 *              当 loading，接口挂掉的页面就会永久脉动——用户看不出是「在加载」还是「坏了」。
 *              落定且为空（真的没有门类有挂靠）时交空数组，界面只留「全部行业」一个 chip。
 *              另钉两个关键词框的 300ms 防抖：连打只发一次请求，且带的是最后一次输入。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSupplierSearch } from "@/features/supplier/hooks/useSupplierSearch";

const mockApi = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

/** 挂载时的调用顺序：facet effect 在前、列表 effect 在后（按声明顺序执行） */
const pageResult = { items: [], total: 0, page: 1, pageSize: 8 };
const sections = [
  { code: "UGT-I-03", nameZh: "制造业", nameEn: "Manufacturing", suppliers: 13 },
  { code: "UGT-I-07", nameZh: "交通运输、仓储和邮政业", nameEn: "Transportation and storage", suppliers: 1 },
];

describe("useSupplierSearch — 行业主轴 facet 状态", () => {
  afterEach(() => {
    mockApi.mockReset();
    vi.restoreAllMocks();
  });

  it("facet 未落定 → loaded=false（界面据此给骨架）", () => {
    mockApi.mockImplementation(() => new Promise(() => {})); // 永不 resolve
    const { result } = renderHook(() => useSupplierSearch({ locale: "zh", searchTerm: "" }));
    expect(result.current.industrySectionsLoaded).toBe(false);
    expect(result.current.industrySections).toEqual([]);
  });

  it("facet 成功 → loaded=true 且拿到门类列表", async () => {
    mockApi.mockResolvedValueOnce(sections).mockResolvedValueOnce(pageResult);
    const { result } = renderHook(() => useSupplierSearch({ locale: "zh", searchTerm: "" }));
    await waitFor(() => expect(result.current.industrySectionsLoaded).toBe(true));
    expect(result.current.industrySections.map((s) => s.code)).toEqual(["UGT-I-03", "UGT-I-07"]);
  });

  it("facet 失败 → loaded 同样置上（不得把页面停在永久骨架），并保留告警", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockApi.mockRejectedValueOnce(new Error("facets down")).mockResolvedValueOnce(pageResult);
    const { result } = renderHook(() => useSupplierSearch({ locale: "zh", searchTerm: "" }));
    await waitFor(() => expect(result.current.industrySectionsLoaded).toBe(true));
    expect(result.current.industrySections).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("接口返回不是数组（契约漂移）→ 归一成空数组而不是把脏值透给 chip 行", async () => {
    mockApi.mockResolvedValueOnce({ data: sections }).mockResolvedValueOnce(pageResult);
    const { result } = renderHook(() => useSupplierSearch({ locale: "zh", searchTerm: "" }));
    await waitFor(() => expect(result.current.industrySectionsLoaded).toBe(true));
    expect(result.current.industrySections).toEqual([]);
  });

  it("关键词防抖：连打三个字符只多一次列表请求，且用的是最后一次输入", async () => {
    mockApi.mockImplementation((url: string) =>
      Promise.resolve(url.startsWith("/api/industries/facets") ? sections : pageResult));
    const { result, rerender } = renderHook(
      ({ term }: { term: string }) => useSupplierSearch({ locale: "zh", searchTerm: term }),
      { initialProps: { term: "" } },
    );
    await waitFor(() => expect(result.current.industrySectionsLoaded).toBe(true));
    const before = mockApi.mock.calls.length;

    rerender({ term: "L" });
    rerender({ term: "LE" });
    rerender({ term: "LED" });
    // 防抖窗口内不得抢跑（每个字符一次请求就是把 QPS 乘以字长）
    expect(mockApi.mock.calls.length).toBe(before);

    await waitFor(() => expect(mockApi.mock.calls.length).toBe(before + 1), { timeout: 2000 });
    const lastUrl = String(mockApi.mock.calls[mockApi.mock.calls.length - 1][0]);
    expect(lastUrl).toContain("q=LED");
    expect(lastUrl).not.toContain("q=L&");
    expect(lastUrl).not.toContain("q=LE&");
    expect(result.current.total).toBe(0);
  });

  it("行业词框同样防抖：它每按一个字符要多打 1–2 次权威树查询，不等一拍就是双倍 QPS", async () => {
    mockApi.mockImplementation((url: string) =>
      Promise.resolve(url.startsWith("/api/industries/facets") ? sections : pageResult));
    const { rerender } = renderHook(
      ({ kw }: { kw: string }) => useSupplierSearch({ locale: "zh", searchTerm: "", industryKeyword: kw }),
      { initialProps: { kw: "" } },
    );
    await waitFor(() => expect(mockApi.mock.calls.length).toBeGreaterThanOrEqual(2));
    const before = mockApi.mock.calls.length;
    rerender({ kw: "电气" });
    rerender({ kw: "电气机" });
    rerender({ kw: "电气机械" });
    expect(mockApi.mock.calls.length).toBe(before);
    await waitFor(() => expect(mockApi.mock.calls.length).toBe(before + 1), { timeout: 2000 });
    expect(String(mockApi.mock.calls[mockApi.mock.calls.length - 1][0])).toContain(
      `industry_q=${encodeURIComponent("电气机械")}`,
    );
  });
});
