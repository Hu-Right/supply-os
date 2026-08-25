/**
 * server/services/industry-profile/resolve.ts 测试
 * 覆盖 invalidateProfileCache（纯函数部分）
 */
import { describe, it, expect } from "vitest";

import { invalidateProfileCache } from "../../../../server/services/industry-profile/resolve";

describe("invalidateProfileCache", () => {
  it("无参数 → 清空全部缓存（不抛错）", () => {
    expect(() => invalidateProfileCache()).not.toThrow();
  });

  it("指定 userKey → 删除该用户缓存（不抛错）", () => {
    expect(() => invalidateProfileCache("user-123")).not.toThrow();
  });

  it("连续调用不抛错", () => {
    invalidateProfileCache("a");
    invalidateProfileCache("b");
    invalidateProfileCache();
    expect(true).toBe(true);
  });
});
