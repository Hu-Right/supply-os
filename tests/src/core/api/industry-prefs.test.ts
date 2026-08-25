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
    const result = await fetchIndustryPrefs("user1");
    expect(result).toEqual({ level1_id: 50, level2_id: 20 });
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/user/industry-prefs"),
    );
  });

  it("无 prefs 字段返回 null", async () => {
    apiMock.mockResolvedValue({});
    const result = await fetchIndustryPrefs("user1");
    expect(result).toBeNull();
  });

  it("异常返回 null（不抛出）", async () => {
    apiMock.mockRejectedValue(new Error("Network error"));
    const result = await fetchIndustryPrefs("user1");
    expect(result).toBeNull();
  });

  it("userKey 被 URL 编码", async () => {
    apiMock.mockResolvedValue({ prefs: null });
    await fetchIndustryPrefs("user@test.com");
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("user_key=user%40test.com"),
    );
  });
});

describe("saveIndustryPrefs", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ success: true });
  });

  it("POST 发送 user_key 和偏好", () => {
    saveIndustryPrefs("user1", { level1_id: 50, level2_id: 20 });
    expect(apiMock).toHaveBeenCalledWith("/api/user/industry-prefs", {
      method: "POST",
      body: { user_key: "user1", level1_id: 50, level2_id: 20 },
    });
  });
});
