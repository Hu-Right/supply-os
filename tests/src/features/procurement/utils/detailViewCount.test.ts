/**
 * src/features/procurement/utils/detailViewCount.ts 测试
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getDetailViewCount, setDetailViewCount } from "../../../../../src/features/procurement/utils/detailViewCount";

describe("detailViewCount", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("默认计数为 0", () => {
    expect(getDetailViewCount("user1")).toBe(0);
  });

  it("设置并获取计数", () => {
    setDetailViewCount("user1", 5);
    expect(getDetailViewCount("user1")).toBe(5);
  });

  it("不同用户隔离", () => {
    setDetailViewCount("user1", 3);
    setDetailViewCount("user2", 7);
    expect(getDetailViewCount("user1")).toBe(3);
    expect(getDetailViewCount("user2")).toBe(7);
  });

  it("guest 用户", () => {
    setDetailViewCount(undefined, 2);
    expect(getDetailViewCount(undefined)).toBe(2);
  });

  it("覆盖旧值", () => {
    setDetailViewCount("user1", 1);
    setDetailViewCount("user1", 10);
    expect(getDetailViewCount("user1")).toBe(10);
  });
});
