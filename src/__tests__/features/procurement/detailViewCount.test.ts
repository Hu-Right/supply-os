import { describe, it, expect, beforeEach } from "vitest";
import {
  getDetailViewCount,
  setDetailViewCount,
} from "@/features/procurement/utils/detailViewCount";

describe("detailViewCount（详情页本地查看计数）", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns 0 when nothing was stored", () => {
    expect(getDetailViewCount("uk_test")).toBe(0);
    expect(getDetailViewCount(undefined)).toBe(0);
  });

  it("round-trips set and get for a user", () => {
    setDetailViewCount("uk_test", 3);
    expect(getDetailViewCount("uk_test")).toBe(3);
    setDetailViewCount("uk_test", 0);
    expect(getDetailViewCount("uk_test")).toBe(0);
  });

  it("isolates counters per user key", () => {
    setDetailViewCount("uk_a", 1);
    setDetailViewCount("uk_b", 5);
    expect(getDetailViewCount("uk_a")).toBe(1);
    expect(getDetailViewCount("uk_b")).toBe(5);
  });

  it("falls back to the shared guest bucket when userKey is missing", () => {
    setDetailViewCount(undefined, 2);
    expect(window.localStorage.getItem("procurement_detail_views_guest")).toBe("2");
    expect(getDetailViewCount(undefined)).toBe(2);

    // 空字符串同样落入 guest 桶
    setDetailViewCount("", 4);
    expect(getDetailViewCount(undefined)).toBe(4);
  });

  it("guest bucket stays separate from named users", () => {
    setDetailViewCount(undefined, 2);
    setDetailViewCount("uk_test", 7);
    expect(getDetailViewCount(undefined)).toBe(2);
    expect(getDetailViewCount("uk_test")).toBe(7);
  });
});
