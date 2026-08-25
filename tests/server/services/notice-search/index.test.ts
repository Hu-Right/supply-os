/**
 * server/services/notice-search/ + bid-report/ 工具函数测试
 * 覆盖 cache.ts 缓存键生成、bid-report constants/merge 纯函数
 */
import { describe, it, expect } from "vitest";

// ── notice-search/cache ──
import {
  searchCacheKey, countCacheKey, clearAllCaches,
  getCountCache, setCountCache, clearCountCaches,
} from "../../../../server/services/notice-search/cache";

describe("searchCacheKey (notice-search)", () => {
  it("相同参数生成相同键", () => {
    const p = { page: 1, pageSize: 9, q: "water", country: "Kenya", sort: "deadline_farthest" } as any;
    expect(searchCacheKey(p)).toBe(searchCacheKey(p));
  });

  it("不同参数生成不同键", () => {
    const p1 = { page: 1, q: "water" } as any;
    const p2 = { page: 2, q: "water" } as any;
    expect(searchCacheKey(p1)).not.toBe(searchCacheKey(p2));
  });
});

describe("countCacheKey", () => {
  it("不含 page/pageSize（翻页不影响总数）", () => {
    const p1 = { page: 1, pageSize: 9, q: "water" } as any;
    const p2 = { page: 2, pageSize: 30, q: "water" } as any;
    expect(countCacheKey(p1)).toBe(countCacheKey(p2));
  });

  it("不同 q 生成不同键", () => {
    const p1 = { q: "water" } as any;
    const p2 = { q: "food" } as any;
    expect(countCacheKey(p1)).not.toBe(countCacheKey(p2));
  });
});

describe("COUNT 缓存读写", () => {
  it("setCountCache + getCountCache 常规", () => {
    setCountCache("key-1", false, 100);
    expect(getCountCache("key-1", false)).toBe(100);
  });

  it("keyword 缓存与常规缓存隔离", () => {
    setCountCache("key-2", false, 50);
    setCountCache("key-2", true, 200);
    expect(getCountCache("key-2", false)).toBe(50);
    expect(getCountCache("key-2", true)).toBe(200);
  });

  it("clearCountCaches 清空两个缓存", () => {
    setCountCache("key-3", false, 10);
    setCountCache("key-3", true, 20);
    clearCountCaches();
    expect(getCountCache("key-3", false)).toBeUndefined();
    expect(getCountCache("key-3", true)).toBeUndefined();
  });
});

describe("clearAllCaches", () => {
  it("不抛异常", () => {
    expect(() => clearAllCaches()).not.toThrow();
  });
});

// ── bid-report/constants ──
import { safe, safeObj, PLATFORMS, INDUSTRY_MAP } from "../../../../server/services/bid-report/constants";

describe("safe", () => {
  it("null/undefined/false/空串 → 空串", () => {
    expect(safe(null)).toBe("");
    expect(safe(undefined)).toBe("");
    expect(safe(false)).toBe("");
    expect(safe("")).toBe("");
  });

  it("有值转字符串", () => {
    expect(safe("hello")).toBe("hello");
    expect(safe(123)).toBe("123");
    expect(safe(0)).toBe("0");
  });
});

describe("safeObj", () => {
  it("对象直通", () => {
    const obj = { key: "value" };
    expect(safeObj(obj)).toBe(obj);
  });

  it("JSON 字符串解析", () => {
    expect(safeObj('{"a":1}')).toEqual({ a: 1 });
  });

  it("数组返回空对象", () => {
    expect(safeObj([1, 2])).toEqual({});
    expect(safeObj("[]")).toEqual({});
  });

  it("坏 JSON 返回空对象", () => {
    expect(safeObj("not-json")).toEqual({});
  });

  it("null/undefined 返回空对象", () => {
    expect(safeObj(null)).toEqual({});
    expect(safeObj(undefined)).toEqual({});
  });
});

describe("PLATFORMS / INDUSTRY_MAP", () => {
  it("PLATFORMS 包含主要平台", () => {
    expect(PLATFORMS.ungm).toContain("UNGM");
    expect(PLATFORMS.ted).toContain("TED");
  });

  it("INDUSTRY_MAP 包含主要行业", () => {
    expect(INDUSTRY_MAP.medical).toContain("医疗");
    expect(INDUSTRY_MAP.it).toContain("信息");
  });
});

// ── bid-report/merge ──
import { mergeBidReportRow, bidReportFileName } from "../../../../server/services/bid-report/merge";

describe("mergeBidReportRow", () => {
  it("opportunity 字段优先", () => {
    const notice = { id: 1, title: "Notice Title", reference: "REF-001" };
    const opp = { id: 10, title: "Opp Title", reference: "REF-002" };
    const merged = mergeBidReportRow(notice, opp);
    expect(merged.id).toBe(10);
    expect(merged.title).toBe("Opp Title");
    expect(merged.reference).toBe("REF-002");
  });

  it("opportunity 为 null 时使用 notice", () => {
    const notice = { id: 1, title: "Notice Title", reference: "REF-001" };
    const merged = mergeBidReportRow(notice, null);
    expect(merged.id).toBe(1);
    expect(merged.title).toBe("Notice Title");
  });

  it("safe 字段处理 null/false", () => {
    const notice = { id: 1, source_platform: null };
    const merged = mergeBidReportRow(notice, null);
    expect(merged.source_platform).toBe("");
  });
});

describe("bidReportFileName", () => {
  it("有 reference 时使用 reference", () => {
    const name = bidReportFileName({ reference: "REF-123" });
    expect(name).toContain("REF-123");
    expect(name).toMatch(/^中文版订单拆解报告_/);
    expect(name).toMatch(/\.docx$/);
  });

  it("无 reference 时使用 N+id", () => {
    const name = bidReportFileName({ reference: "", id: 42 });
    expect(name).toContain("N42");
  });

  it("清洗特殊字符", () => {
    const name = bidReportFileName({ reference: "REF/2026:test" });
    expect(name).not.toContain("/");
    expect(name).not.toContain(":");
  });

  it("文件名截断 60 字符", () => {
    const name = bidReportFileName({ reference: "A".repeat(100) });
    const core = name.replace("中文版订单拆解报告_", "").replace(".docx", "");
    expect(core.length).toBeLessThanOrEqual(60);
  });
});

// ── notice-search/countries ──
import { expandCountryAliases, expandCountryAllForms } from "../../../../server/services/notice-search/countries";

describe("expandCountryAliases", () => {
  it("已知国家展开所有大写形式", () => {
    const aliases = expandCountryAliases("South Korea");
    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases.every((a: string) => a === a.toUpperCase())).toBe(true);
  });

  it("未知国家返回自身大写", () => {
    const aliases = expandCountryAliases("Atlantis");
    expect(aliases).toEqual(["ATLANTIS"]);
  });
});

describe("expandCountryAllForms", () => {
  it("已知国家返回多种形式", () => {
    const forms = expandCountryAllForms("Philippines");
    expect(forms.length).toBeGreaterThan(0);
  });

  it("未知国家返回原始+大写", () => {
    const forms = expandCountryAllForms("Atlantis");
    expect(forms).toContain("Atlantis");
    expect(forms).toContain("ATLANTIS");
  });
});
