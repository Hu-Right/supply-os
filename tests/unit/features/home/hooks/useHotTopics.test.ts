import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useHotTopics, hotGroupView } from "@/features/home/hooks/useHotTopics";

const mockApi = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

// 服务端给的是「骨架 L1 树码 + 树名 + 计数」（2026-10-15 G 码退役，名字以树为唯一事实源）
const mockTopics = {
  countries: [{ country: "CN", count: 100 }, { country: "US", count: 80 }],
  industries: [{ code: "UGT-01", nameZh: "建筑施工与运维服务", count: 50 }],
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

describe("hotGroupView（L1 码 → 标签/链接，两个组件共用一份口径）", () => {
  it("名字走服务端树名，链接走 ?commodity=<L1 码>（检索侧品目谓词入口，传 L1 即大类筛选）", () => {
    expect(hotGroupView([{ code: "UGT-01", nameZh: "建筑施工与运维服务", count: 50 }])).toEqual([
      { key: "UGT-01", label: "建筑施工与运维服务", count: 50, href: "/procurement?commodity=UGT-01" },
    ]);
  });

  it("不认识的码直接丢掉：不让非法形制漏成筛选键，也不给点不开的空标签", () => {
    const items = [
      { code: "UGT-01", nameZh: "建筑施工与运维服务", count: 50 },
      { code: "UGT-G-99", nameZh: "旧码残留", count: 40 },
      { code: "", nameZh: "无码", count: 30 },
    ];
    expect(hotGroupView(items).map((v) => v.key)).toEqual(["UGT-01"]);
  });
});
