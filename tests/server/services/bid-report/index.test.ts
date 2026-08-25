/**
 * server/services/bid-report/ 单元测试
 * 覆盖 constants.ts (safe/safeObj), merge.ts (mergeBidReportRow/bidReportFileName),
 *       preview.ts (estimateFullReportCharCount)
 */
import { describe, it, expect } from "vitest";

// ── constants.ts ──
import { safe, safeObj, PLATFORMS, INDUSTRY_MAP } from "../../../../server/services/bid-report/constants";

describe("safe (constants.ts)", () => {
  it("null/undefined/false/空串返回空字符串", () => {
    expect(safe(null)).toBe("");
    expect(safe(undefined)).toBe("");
    expect(safe(false)).toBe("");
    expect(safe("")).toBe("");
  });

  it("数字转字符串", () => {
    expect(safe(0)).toBe("0");
    expect(safe(42)).toBe("42");
    expect(safe(3.14)).toBe("3.14");
  });

  it("普通字符串直通", () => {
    expect(safe("hello")).toBe("hello");
    expect(safe("  spaces  ")).toBe("  spaces  ");
  });

  it("对象/数组转字符串（String() 行为）", () => {
    // safe() 使用 String(v)，对象变为 "[object Object]"
    expect(safe({ a: 1 })).toBe("[object Object]");
    expect(safe([1, 2])).toBe("1,2");
  });
});

describe("safeObj (constants.ts)", () => {
  it("对象直通返回", () => {
    const obj = { key: "value" };
    expect(safeObj(obj)).toBe(obj);
  });

  it("有效 JSON 字符串解析为对象", () => {
    expect(safeObj('{"key":"value"}')).toEqual({ key: "value" });
  });

  it("无效 JSON 字符串返回空对象", () => {
    expect(safeObj("not json")).toEqual({});
    expect(safeObj("{bad}")).toEqual({});
  });

  it("数组返回空对象（非对象类型）", () => {
    expect(safeObj([1, 2, 3])).toEqual({});
    expect(safeObj("[]")).toEqual({});
  });

  it("null/undefined/数字返回空对象", () => {
    expect(safeObj(null)).toEqual({});
    expect(safeObj(undefined)).toEqual({});
    expect(safeObj(42)).toEqual({});
  });
});

describe("PLATFORMS / INDUSTRY_MAP", () => {
  it("PLATFORMS 包含主要平台", () => {
    expect(PLATFORMS.ungm).toBe("UNGM (ungm.org)");
    expect(PLATFORMS.undp).toBe("UNDP Procurement");
    expect(PLATFORMS.other).toBe("其他");
  });

  it("INDUSTRY_MAP 包含主要行业", () => {
    expect(INDUSTRY_MAP.it).toBe("信息技术");
    expect(INDUSTRY_MAP.medical).toBe("医疗/卫生");
    expect(INDUSTRY_MAP.other).toBe("其他");
  });
});

// ── merge.ts ──
import { mergeBidReportRow, bidReportFileName } from "../../../../server/services/bid-report/merge";

describe("mergeBidReportRow", () => {
  it("opportunity 字段优先于 notice", () => {
    const notice = { id: 1, title: "Notice Title", reference: "REF-001" };
    const opp = { title: "Opp Title", reference: "REF-002" };
    const merged = mergeBidReportRow(notice, opp);
    expect(merged.title).toBe("Opp Title");
    expect(merged.reference).toBe("REF-002");
  });

  it("opportunity 为 null 时使用 notice 字段", () => {
    const notice = { id: 1, title: "Notice Title", reference: "REF-001" };
    const merged = mergeBidReportRow(notice, null);
    expect(merged.title).toBe("Notice Title");
    expect(merged.reference).toBe("REF-001");
  });

  it("id 取 opportunity.id（优先）", () => {
    const notice = { id: 1 };
    const opp = { id: 2 };
    expect(mergeBidReportRow(notice, opp).id).toBe(2);
    expect(mergeBidReportRow(notice, null).id).toBe(1);
  });

  it("safe 字段处理 null/undefined", () => {
    const notice = { id: 1 };
    const merged = mergeBidReportRow(notice, null);
    expect(merged.source_platform).toBe("");
    expect(merged.incoterms).toBe("");
    expect(merged.description_cn).toBe("");
  });
});

describe("bidReportFileName", () => {
  it("使用 reference 作为文件名后缀", () => {
    const row = { reference: "RFQ-2026-001", id: 123 };
    expect(bidReportFileName(row)).toBe("中文版订单拆解报告_RFQ-2026-001.docx");
  });

  it("无 reference 时使用 N + id", () => {
    const row = { id: 456 };
    expect(bidReportFileName(row)).toBe("中文版订单拆解报告_N456.docx");
  });

  it("无 reference 和 id 时使用 N0", () => {
    const row = {};
    expect(bidReportFileName(row)).toBe("中文版订单拆解报告_N0.docx");
  });

  it("文件名清洗敏感字符", () => {
    const row = { reference: "RFQ/2026:001*test" };
    const name = bidReportFileName(row);
    expect(name).not.toContain("/");
    expect(name).not.toContain(":");
    expect(name).not.toContain("*");
  });

  it("文件名截断到 60 字符", () => {
    const row = { reference: "A".repeat(100) };
    const name = bidReportFileName(row);
    // 前缀 "中文版订单拆解报告_" (10字符) + suffix (最多60字符) + ".docx" (5字符)
    expect(name.length).toBeLessThanOrEqual(80);
  });
});

// ── preview.ts ──
import { estimateFullReportCharCount } from "../../../../server/services/bid-report/preview";

describe("estimateFullReportCharCount", () => {
  it("空行返回基础字符数（章节标题等）", () => {
    const count = estimateFullReportCharCount({});
    expect(count).toBeGreaterThan(0);
  });

  it("有标题和描述时字符数增加", () => {
    const empty = estimateFullReportCharCount({});
    const withTitle = estimateFullReportCharCount({ title: "Test Title", description: "Test Description" });
    expect(withTitle).toBeGreaterThan(empty);
  });

  it("有 products 时字符数显著增加", () => {
    const noProducts = estimateFullReportCharCount({ description: "test" });
    const withProducts = estimateFullReportCharCount({
      ai_products: [{ name: "Product A", scope: "High scope" }],
    });
    expect(withProducts).toBeGreaterThan(noProducts);
  });
});
