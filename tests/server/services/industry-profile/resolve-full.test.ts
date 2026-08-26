/**
 * server/services/industry-profile/resolve.ts 补充测试
 * 覆盖 invalidateProfileCache + resolveUserIndustryProfile（mock DB）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// 使用 function 声明以兼容 new 调用
const mockGetIndustryPrefs = vi.fn();
const mockFindUnspscNodeById = vi.fn();

vi.mock("../../../../server/repos/user-prefs.repo", () => {
  function UserPrefsRepo(this: any) {
    this.getIndustryPrefs = mockGetIndustryPrefs;
  }
  return { UserPrefsRepo };
});

vi.mock("../../../../server/repos/catalog.repo", () => {
  function CatalogRepo(this: any) {
    this.findUnspscNodeById = mockFindUnspscNodeById;
  }
  return { CatalogRepo };
});

vi.mock("../../../../server/services/unspsc/index", () => ({
  unspscPrefixFromCode: (code: string) => code ? code.slice(0, 4) : "",
}));

import { invalidateProfileCache, resolveUserIndustryProfile } from "../../../../server/services/industry-profile/resolve";

describe("invalidateProfileCache", () => {
  it("无参数 → 清除全部缓存（不抛异常）", () => {
    expect(() => invalidateProfileCache()).not.toThrow();
  });

  it("指定 userKey → 清除单个缓存（不抛异常）", () => {
    expect(() => invalidateProfileCache("user1")).not.toThrow();
  });
});

describe("resolveUserIndustryProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateProfileCache();
  });

  it("无行业偏好 → 返回 null", async () => {
    mockGetIndustryPrefs.mockResolvedValue(null);
    const pool = { query: vi.fn() } as any;
    const result = await resolveUserIndustryProfile(pool, "user-no-prefs");
    expect(result).toBeNull();
  });

  it("有偏好但全部失效 → 返回 null", async () => {
    mockGetIndustryPrefs.mockResolvedValue({
      level1_id: 99999, level2_id: 0, level3_id: 0, level4_id: 0, level5_id: 0,
    });
    mockFindUnspscNodeById.mockResolvedValue(null);

    const pool = { query: vi.fn() } as any;
    const result = await resolveUserIndustryProfile(pool, "user-stale-prefs");
    expect(result).toBeNull();
  });

  it("有效偏好 → 返回画像", async () => {
    mockGetIndustryPrefs.mockResolvedValue({
      level1_id: 10, level2_id: 20, level3_id: 30, level4_id: 40, level5_id: 0,
    });
    mockFindUnspscNodeById.mockResolvedValue({
      id: 40, code: "42140000", title_zh: "测试行业", title: "Test Industry", level: 4,
    });

    const pool = { query: vi.fn() } as any;
    const result = await resolveUserIndustryProfile(pool, "user-valid");
    expect(result).not.toBeNull();
    expect(result!.deepestLevel).toBe(4);
    expect(result!.deepestId).toBe(40);
    expect(result!.industryTitleZh).toBe("测试行业");
    expect(result!.branchPrefix).toBe("4214");
  });

  it("缓存命中 → 不查询 DB", async () => {
    mockGetIndustryPrefs.mockResolvedValue({
      level1_id: 10, level2_id: 0, level3_id: 0, level4_id: 0, level5_id: 0,
    });
    mockFindUnspscNodeById.mockResolvedValue({
      id: 10, code: "01", title_zh: "农业", title: "Agriculture", level: 1,
    });

    const pool = { query: vi.fn() } as any;
    await resolveUserIndustryProfile(pool, "cached-user");
    const callsAfterFirst = mockGetIndustryPrefs.mock.calls.length;
    await resolveUserIndustryProfile(pool, "cached-user");
    expect(mockGetIndustryPrefs.mock.calls.length).toBe(callsAfterFirst);
  });
});
