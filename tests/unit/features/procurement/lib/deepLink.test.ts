/**
 * deepLink 纯函数单测 —— 详情深链 ?notice_id 的 URL 改名规则
 * 覆盖：写入/清除/保留其它参数/非法 pk/幂等。
 */
import { describe, expect, it } from "vitest";
import { applyNoticeIdParam, readNoticeIdParam } from "@/features/procurement/lib/deepLink";

describe("applyNoticeIdParam（notice_id 深链写入/清除）", () => {
  it("无参时写入 notice_id", () => {
    expect(applyNoticeIdParam("", 1786775789)).toBe("notice_id=1786775789");
  });

  it("保留其它筛选参数，仅追加 notice_id", () => {
    const out = applyNoticeIdParam("keyword=%E7%94%B5%E6%A2%AF&page=2&country=CN", 42);
    const p = new URLSearchParams(out);
    expect(p.get("notice_id")).toBe("42");
    expect(p.get("keyword")).toBe("电梯");
    expect(p.get("page")).toBe("2");
    expect(p.get("country")).toBe("CN");
  });

  it("已有 notice_id 时改为新值、不动其它参数", () => {
    const p = new URLSearchParams(applyNoticeIdParam("notice_id=1&tab=fav", 9));
    expect(p.get("notice_id")).toBe("9");
    expect(p.get("tab")).toBe("fav");
  });

  it("pk 为 null/undefined 时仅清除 notice_id，保留其它", () => {
    const out = applyNoticeIdParam("notice_id=9&keyword=abc", null);
    const p = new URLSearchParams(out);
    expect(p.has("notice_id")).toBe(false);
    expect(p.get("keyword")).toBe("abc");
    expect(applyNoticeIdParam("notice_id=9", undefined)).toBe("");
  });

  it("非法 pk（<=0 / NaN）视为清除，不写入脏值", () => {
    expect(new URLSearchParams(applyNoticeIdParam("", 0)).has("notice_id")).toBe(false);
    expect(new URLSearchParams(applyNoticeIdParam("", NaN)).has("notice_id")).toBe(false);
  });

  it("幂等：对已含目标值的串再写同值结果不变", () => {
    const once = applyNoticeIdParam("a=1", 7);
    expect(applyNoticeIdParam(once, 7)).toBe(once);
  });
});

describe("readNoticeIdParam（解析深链主键）", () => {
  it("存在则解析为数字；缺失/非法返回 null", () => {
    expect(readNoticeIdParam("notice_id=42&x=1")).toBe(42);
    expect(readNoticeIdParam("x=1")).toBeNull();
    expect(readNoticeIdParam("notice_id=abc")).toBeNull();
    expect(readNoticeIdParam("notice_id=0")).toBeNull();
  });
});
