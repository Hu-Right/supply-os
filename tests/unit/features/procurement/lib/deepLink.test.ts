/**
 * deepLink 纯函数单测 —— 旧详情深链 ?notice_id 的解析
 */
import { describe, expect, it } from "vitest";
import { readNoticeIdParam } from "@/features/procurement/lib/deepLink";

describe("readNoticeIdParam（解析旧深链主键）", () => {
  it("存在则解析为数字；缺失/非法返回 null", () => {
    expect(readNoticeIdParam("notice_id=42&x=1")).toBe(42);
    expect(readNoticeIdParam("x=1")).toBeNull();
    expect(readNoticeIdParam("notice_id=abc")).toBeNull();
    expect(readNoticeIdParam("notice_id=0")).toBeNull();
  });
});
