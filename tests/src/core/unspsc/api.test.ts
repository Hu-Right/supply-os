/**
 * src/core/unspsc/api.ts 测试
 * 覆盖 fetchUnspscIndustries, fetchUnspscChildren, fetchSmartInferUnspsc
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock apiCached 和 buildQuery
const apiCachedMock = vi.fn();
vi.mock("@/core/http", () => ({
  apiCached: (...args: any[]) => apiCachedMock(...args),
  buildQuery: (params: Record<string, any>) => {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
  },
}));

import { fetchUnspscIndustries, fetchUnspscChildren, fetchSmartInferUnspsc } from "@/core/unspsc/api";

describe("fetchUnspscIndustries", () => {
  beforeEach(() => {
    apiCachedMock.mockReset();
    apiCachedMock.mockResolvedValue([]);
  });

  it("无 locale 时不传 lang 参数", async () => {
    await fetchUnspscIndustries();
    expect(apiCachedMock).toHaveBeenCalledWith("/api/unspsc/industries");
  });

  it("zh locale 不传 lang（默认语言）", async () => {
    await fetchUnspscIndustries("zh");
    expect(apiCachedMock).toHaveBeenCalledWith("/api/unspsc/industries");
  });

  it("fr locale 传 lang=fr", async () => {
    await fetchUnspscIndustries("fr");
    expect(apiCachedMock).toHaveBeenCalledWith("/api/unspsc/industries?lang=fr");
  });

  it("ar locale 传 lang=ar", async () => {
    await fetchUnspscIndustries("ar");
    expect(apiCachedMock).toHaveBeenCalledWith("/api/unspsc/industries?lang=ar");
  });
});

describe("fetchUnspscChildren", () => {
  beforeEach(() => {
    apiCachedMock.mockReset();
    apiCachedMock.mockResolvedValue([]);
  });

  it("传 parent_id", async () => {
    await fetchUnspscChildren("50201200");
    expect(apiCachedMock).toHaveBeenCalledWith(
      expect.stringContaining("parent_id=50201200"),
    );
  });

  it("fr locale 传 lang", async () => {
    await fetchUnspscChildren("50201200", "fr");
    const url = apiCachedMock.mock.calls[0][0];
    expect(url).toContain("parent_id=50201200");
    expect(url).toContain("lang=fr");
  });

  it("zh locale 不传 lang", async () => {
    await fetchUnspscChildren("50201200", "zh");
    const url = apiCachedMock.mock.calls[0][0];
    expect(url).toContain("parent_id=50201200");
    expect(url).not.toContain("lang=");
  });
});

describe("fetchSmartInferUnspsc", () => {
  beforeEach(() => {
    apiCachedMock.mockReset();
    apiCachedMock.mockResolvedValue({ result: null, candidates: [] });
  });

  it("URL 编码查询参数", async () => {
    await fetchSmartInferUnspsc("IT software");
    expect(apiCachedMock).toHaveBeenCalledWith(
      expect.stringContaining("q=IT%20software"),
    );
  });

  it("返回 result 和 candidates", async () => {
    apiCachedMock.mockResolvedValue({
      result: { level1_id: 50, level2_id: null, level3_id: null, level4_id: null, level5_id: null, matched_title: "IT" },
      candidates: [],
    });
    const data = await fetchSmartInferUnspsc("IT");
    expect(data.result).not.toBeNull();
    expect(data.result!.level1_id).toBe(50);
  });
});
