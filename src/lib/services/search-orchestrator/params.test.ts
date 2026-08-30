import { describe, it, expect } from "vitest";
import { validateParams, searchCacheKey } from "./params";

describe("validateParams", () => {
  it("默认值：mode=default, page=1, pageSize=10", () => {
    const p = validateParams({});
    expect(p.mode).toBe("default");
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(10);
  });

  it("mode=prefs → 保留", () => {
    expect(validateParams({ mode: "prefs" }).mode).toBe("prefs");
  });

  it("mode=recommended → 保留", () => {
    expect(validateParams({ mode: "recommended" }).mode).toBe("recommended");
  });

  it("mode=invalid → 回退 default", () => {
    expect(validateParams({ mode: "bogus" }).mode).toBe("default");
  });

  it("page 钳制 [1, 1000]", () => {
    expect(validateParams({ page: 0 }).page).toBe(1);
    expect(validateParams({ page: 9999 }).page).toBe(1000);
    expect(validateParams({ page: 5 }).page).toBe(5);
  });

  it("pageSize 钳制 [6, 30]", () => {
    expect(validateParams({ pageSize: 1 }).pageSize).toBe(6);
    expect(validateParams({ pageSize: 100 }).pageSize).toBe(30);
    expect(validateParams({ pageSize: 15 }).pageSize).toBe(15);
  });

  it("q 截断 200 字符 + trim", () => {
    const longQ = "a".repeat(250);
    expect(validateParams({ q: longQ }).q.length).toBe(200);
    expect(validateParams({ q: "  test  " }).q).toBe("test");
  });

  it("日期格式校验：合法 → 保留", () => {
    expect(validateParams({ deadlineFrom: "2026-01-01" }).deadlineFrom).toBe("2026-01-01");
  });

  it("日期格式校验：非法 → 空串", () => {
    expect(validateParams({ deadlineFrom: "01/01/2026" }).deadlineFrom).toBe("");
    expect(validateParams({ deadlineFrom: "abc" }).deadlineFrom).toBe("");
  });

  it("sort=latest → latest", () => {
    expect(validateParams({ sort: "latest" }).sort).toBe("latest");
  });

  it("sort=deadline → deadline", () => {
    expect(validateParams({ sort: "deadline" }).sort).toBe("deadline");
  });

  it("sort=invalid → deadline_farthest", () => {
    expect(validateParams({ sort: "bogus" }).sort).toBe("deadline_farthest");
  });

  it("deadlineWithinDays 钳制 [0, 365]", () => {
    expect(validateParams({ deadlineWithinDays: -5 }).deadlineWithinDays).toBe(0);
    expect(validateParams({ deadlineWithinDays: 500 }).deadlineWithinDays).toBe(365);
  });
});

describe("searchCacheKey", () => {
  it("相同参数 → 相同 key", () => {
    const p = validateParams({ q: "test", country: "China" });
    expect(searchCacheKey(p)).toBe(searchCacheKey(p));
  });

  it("大小写归一化：q trim+lowercase", () => {
    const p1 = validateParams({ q: "Water" });
    const p2 = validateParams({ q: "water" });
    expect(searchCacheKey(p1)).toBe(searchCacheKey(p2));
  });

  it("country 大写归一化", () => {
    const p1 = validateParams({ country: "kenya" });
    const p2 = validateParams({ country: "KENYA" });
    expect(searchCacheKey(p1)).toBe(searchCacheKey(p2));
  });
});
