import { describe, it, expect } from "vitest";
import { mergeBidReportRow, bidReportFileName } from "@/lib/services/bid-report/merge";

describe("mergeBidReportRow", () => {
  it("opportunity 字段优先", () => {
    const notice = { id: 1, title: "Notice Title", reference: "REF-001" };
    const opp = { id: 2, title: "Opp Title", reference: "REF-002" };
    const row = mergeBidReportRow(notice, opp);
    expect(row.id).toBe(2);
    expect(row.title).toBe("Opp Title");
    expect(row.reference).toBe("REF-002");
  });

  it("opportunity 为 null → 取 notice 字段", () => {
    const notice = { id: 1, title: "Notice Title", agency: "UNDP" };
    const row = mergeBidReportRow(notice, null);
    expect(row.id).toBe(1);
    expect(row.title).toBe("Notice Title");
    expect(row.agency).toBe("UNDP");
  });

  it("safe 字段：null/false → 空串", () => {
    const notice = { id: 1 };
    const opp = { source_platform: null, incoterms: false };
    const row = mergeBidReportRow(notice, opp);
    expect(row.source_platform).toBe("");
    expect(row.incoterms).toBe("");
  });

  it("JSON 字段自动解析", () => {
    const notice = { id: 1, documents: '[{"name":"doc1"}]' };
    const row = mergeBidReportRow(notice, null);
    expect(row.documents).toEqual([{ name: "doc1" }]);
  });
});

describe("bidReportFileName", () => {
  it("有 reference → 含 reference", () => {
    const name = bidReportFileName({ reference: "REF-001" });
    expect(name).toContain("REF-001");
    expect(name).toMatch(/\.docx$/);
  });

  it("无 reference → 用 N+id", () => {
    const name = bidReportFileName({ id: 42 });
    expect(name).toContain("N42");
  });

  it("特殊字符被替换为下划线", () => {
    const name = bidReportFileName({ reference: "REF/001:test" });
    expect(name).not.toContain("/");
    expect(name).not.toContain(":");
  });
});
