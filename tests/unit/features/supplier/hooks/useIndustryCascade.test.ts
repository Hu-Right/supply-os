/**
 * useIndustryCascade — 行业级联下拉状态测试
 * @module tests/unit/features/supplier/hooks/useIndustryCascade.test.ts
 * @description 钉住级联下拉的三条核心不变量：
 *              1. **选中链纯字符串推导**：给任一层级码（门类/大类/中类/小类）都能截出它上面的每一层，
 *                 点亮对应下拉；非法/空码全空，宁可不点亮也不拿错键去筛。
 *              2. **按需拉子级**：只有链上存在的父码才向 /api/industries/tree 要下一级；门类一层走 facets。
 *              3. **清空退回上一级**：onChange 传空 code 时，最深码回落到上一级祖先（第 0 级清空=全部）。
 *              另钉门类 facet 的失败/契约漂移处理：失败也算 loaded（不把页面停在永久禁用），
 *              接口返回非数组归一成空，脏值不透给下拉。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useIndustryCascade } from "@/features/supplier/hooks/useIndustryCascade";

const mockApi = vi.fn();
const mockApiCached = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: unknown[]) => mockApi(...args),
  apiCached: (...args: unknown[]) => mockApiCached(...args),
}));

const sections = [
  { key: "UGT-I-03", nameZh: "制造业", nameEn: "Manufacturing" },
  { key: "UGT-I-07", nameZh: "交通运输、仓储和邮政业", nameEn: "Transportation" },
];

afterEach(() => {
  mockApi.mockReset();
  mockApiCached.mockReset();
  vi.restoreAllMocks();
});

describe("useIndustryCascade — 选中链推导", () => {
  it("大类码截出门类 + 大类两层，后两层留空", async () => {
    mockApi.mockResolvedValue(sections);
    mockApiCached.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useIndustryCascade({ selectedCode: "UGT-I-0326", onSelect: vi.fn() }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true)); // 排空挂载时的 facet 更新，避免 act 噪声
    expect(result.current.selectedKeys).toEqual(["UGT-I-03", "UGT-I-0326", "", ""]);
  });

  it("小类码（8 位）截满四级", async () => {
    mockApi.mockResolvedValue(sections);
    mockApiCached.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useIndustryCascade({ selectedCode: "UGT-I-03260701", onSelect: vi.fn() }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.selectedKeys).toEqual(["UGT-I-03", "UGT-I-0326", "UGT-I-032607", "UGT-I-03260701"]);
  });

  it("空码/非法码 → 四级全空（不拿猜出来的键去点亮界面）", async () => {
    mockApi.mockResolvedValue(sections);
    const { result } = renderHook(() =>
      useIndustryCascade({ selectedCode: "not-a-code", onSelect: vi.fn() }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.selectedKeys).toEqual(["", "", "", ""]);
  });
});

describe("useIndustryCascade — 按需拉子级", () => {
  it("选了门类 → 只向该门类要大类，第一级用 facets 且映射成 {key,nameZh,nameEn}", async () => {
    mockApi.mockResolvedValue(sections);
    mockApiCached.mockImplementation((url: string) =>
      Promise.resolve(url.includes("parent=UGT-I-03")
        ? [{ key: "UGT-I-0326", nameZh: "电气机械", nameEn: "Electrical" }]
        : []),
    );
    const { result } = renderHook(() =>
      useIndustryCascade({ selectedCode: "UGT-I-03", onSelect: vi.fn() }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.levels[0].map((o) => o.key)).toEqual(["UGT-I-03", "UGT-I-07"]);
    await waitFor(() => expect(result.current.levels[1].map((o) => o.key)).toEqual(["UGT-I-0326"]));
    // 只问了一个父码（大类），没有多余地钻中类/小类
    expect(mockApiCached).toHaveBeenCalledTimes(1);
  });

  it("未选任何行业 → 不拉子级，levels[1..3] 全空", async () => {
    mockApi.mockResolvedValue(sections);
    const { result } = renderHook(() =>
      useIndustryCascade({ selectedCode: "", onSelect: vi.fn() }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(mockApiCached).not.toHaveBeenCalled();
    expect(result.current.levels[1]).toEqual([]);
  });
});

describe("useIndustryCascade — onChange 语义", () => {
  it("选中某级 → 最深码就是它", async () => {
    mockApi.mockResolvedValue(sections);
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useIndustryCascade({ selectedCode: "UGT-I-032607", onSelect }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.onChange(2, "UGT-I-032608"));
    expect(onSelect).toHaveBeenCalledWith("UGT-I-032608");
  });

  it("清空第 i 级 → 退回上一级祖先；清空第 0 级 → 回到全部（空串）", async () => {
    mockApi.mockResolvedValue(sections);
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useIndustryCascade({ selectedCode: "UGT-I-032607", onSelect }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    // chain = [UGT-I-03, UGT-I-0326, UGT-I-032607, ""]；清空中类(index2) → 退回大类
    act(() => result.current.onChange(2, ""));
    expect(onSelect).toHaveBeenLastCalledWith("UGT-I-0326");
    // 清空门类(index0) → 无祖先 → 全部
    act(() => result.current.onChange(0, ""));
    expect(onSelect).toHaveBeenLastCalledWith("");
  });
});

describe("useIndustryCascade — 门类 facet 的失败与契约漂移", () => {
  it("门类加载失败 → loaded 仍置上（不得把整行下拉永久禁用），并保留告警", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockApi.mockRejectedValue(new Error("facets down"));
    const { result } = renderHook(() =>
      useIndustryCascade({ selectedCode: "", onSelect: vi.fn() }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.levels[0]).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("接口返回不是数组（契约漂移）→ 归一成空数组而不是把脏值透给下拉", async () => {
    mockApi.mockResolvedValue({ data: sections });
    const { result } = renderHook(() =>
      useIndustryCascade({ selectedCode: "", onSelect: vi.fn() }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.levels[0]).toEqual([]);
  });
});
