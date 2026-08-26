/**
 * src/core/api/industry-prefs.ts 测试
 * 覆盖 fetchIndustryPrefs, saveIndustryPrefs
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiMock = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: any[]) => apiMock(...args),
}));

import { fetchIndustryPrefs, saveIndustryPrefs } from "@/core/api/industry-prefs";

describe("fetchIndustryPrefs", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("成功获取返回 prefs", async () => {
    apiMock.mockResolvedValue({ prefs: { level1_id: 50, level2_id: 20 } });
    const result = await fetchIndustryPrefs();
    expect(result).toEqual({ level1_id: 50, level2_id: 20 });
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/user/industry-prefs"),
    );
  });

  it("无 prefs 字段返回 null", async () => {
    apiMock.mockResolvedValue({});
    const result = await fetchIndustryPrefs();
    expect(result).toBeNull();
  });

  it("异常返回 null（不抛出）", async () => {
    apiMock.mockRejectedValue(new Error("Network error"));
    const result = await fetchIndustryPrefs();
    expect(result).toBeNull();
  });

  it("不含 legacy user_key 参数（身份由 JWT 承载）", async () => {
    apiMock.mockResolvedValue({ prefs: null });
    await fetchIndustryPrefs();
    expect(apiMock).toHaveBeenCalledWith("/api/user/industry-prefs");
  });
});

describe("saveIndustryPrefs", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ success: true });
  });

  it("POST 仅发送偏好（身份由 JWT 承载）", () => {
    saveIndustryPrefs({ level1_id: 50, level2_id: 20 });
    expect(apiMock).toHaveBeenCalledWith("/api/user/industry-prefs", {
      method: "POST",
      body: { level1_id: 50, level2_id: 20 },
    });
  });
});
