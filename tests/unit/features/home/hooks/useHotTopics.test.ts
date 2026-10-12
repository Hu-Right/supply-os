import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useHotTopics, hotGroupView } from "@/features/home/hooks/useHotTopics";

const mockApi = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

// 服务端给的是「骨架 L1 节点码 + 大类码 + 计数」，不再给旧字典行 id 与 title_zh/title
const mockTopics = {
  countries: [{ country: "CN", count: 100 }, { country: "US", count: 80 }],
  industries: [{ node: "UGT-B-01", code: "UGT-G-11", count: 50 }],
};

describe("useHotTopics", () => {
  afterEach(() => {
    mockApi.mockReset();
  });

  it("初始状态 loading=true, topics=null, error=false", () => {
    mockApi.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useHotTopics());
    expect(result.current.loading).toBe(true);
    expect(result.current.topics).toBeNull();
    expect(result.current.error).toBe(false);
  });

  it("成功加载后 topics 有值，loading=false, error=false", async () => {
    mockApi.mockResolvedValueOnce(mockTopics);
    const { result } = renderHook(() => useHotTopics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.topics).toEqual(mockTopics);
    expect(result.current.error).toBe(false);
  });

  it("API 失败时 error=true, topics=null, loading=false", async () => {
    mockApi.mockRejectedValueOnce(new Error("Network error"));
    const { result } = renderHook(() => useHotTopics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.topics).toBeNull();
    expect(result.current.error).toBe(true);
  });

  it("返回空数据时 topics 为空数组而非 null", async () => {
    mockApi.mockResolvedValueOnce({ countries: [], industries: [] });
    const { result } = renderHook(() => useHotTopics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.topics).toEqual({ countries: [], industries: [] });
    expect(result.current.error).toBe(false);
  });
});

describe("hotGroupView（大类码 → 标签/链接，两个组件共用一份口径）", () => {
  const t = (key: string) => (key === "commodityGroup_UGT-G-11" ? "医疗器械" : key);

  it("名字走 locale 键，链接走 ?group=<大类码>（就是检索侧的大类谓词入口）", () => {
    expect(hotGroupView([{ node: "UGT-B-01", code: "UGT-G-11", count: 50 }], t)).toEqual([
      { key: "UGT-G-11", label: "医疗器械", count: 50, href: "/procurement?group=UGT-G-11" },
    ]);
  });

  it("不认识的码直接丢掉：不让 t() 漏出键名，也不给点不开的空标签", () => {
    const items = [
      { node: "UGT-B-01", code: "UGT-G-11", count: 50 },
      { node: "UGT-B-99", code: "UGT-G-99", count: 40 },
      { node: "UGT-B-02", code: "", count: 30 },
    ];
    expect(hotGroupView(items, t).map((v) => v.key)).toEqual(["UGT-G-11"]);
  });
});
