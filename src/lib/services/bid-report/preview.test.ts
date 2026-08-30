import { describe, it, expect } from "vitest";
import { estimateFullReportCharCount, buildBidReportPreviewText } from "./preview";

const fullRow = {
  title: "Construction of School Buildings",
  agency_full: "UNDP",
  source_platform: "undp",
  reference: "REF-001",
  notice_type: "ITB",
  registration_level: "L3",
  industry: "building",
  estimated_value: "USD 500000",
  published_date: "2026-01-01",
  deadline: "2026-06-30",
  deadline_timezone: "UTC",
  source_url: "https://example.com/tender",
  product_code: "PC-001",
  incoterms: "CIF",
  bid_overview: "Comprehensive construction project",
  description: "Building construction in developing region",
  description_cn: "发展中国家学校建设项目",
  description_other: "Projet de construction",
  supplier_conditions: "Must have experience",
  eligibility: "Open to all qualified bidders",
  technical_hurdles: "High seismic zone requirements",
  remark: "Internal note about this tender",
  training_link: "https://training.example.com",
  unspsc_codes: [{ code: "12345678", name: "Construction" }],
  ai_products: [
    { name: "Cement", scope: "Portland cement type I", product: "", description: "", spec: "" },
    { name: "Steel bars", scope: "", product: "Steel", description: "Reinforcement bars", spec: "12mm" },
  ],
  ai_analysis: {
    summary: "This is a major construction project",
    tech_specs: "High seismic zone, reinforced concrete",
    risks: ["Seismic risk", "Supply chain delays"],
    advantages: ["Local presence", "Experience in similar projects"],
  },
  documents: [
    { name: "Tender Document", url: "https://example.com/doc1" },
    { name: "BoQ", title: "Bill of Quantities", url: "", href: "https://example.com/boq" },
  ],
  external_links: [
    { name: "UNDP Portal", url: "https://undp.org" },
    { title: "World Bank", url: "", href: "https://worldbank.org" },
  ],
  contacts: [
    { name: "John Doe", title: "Procurement Officer", email: "john@undp.org", phone: "+1234567890" },
  ],
};

describe("estimateFullReportCharCount", () => {
  it("空行 → 正数（基础章节框架仍有文本）", () => {
    const count = estimateFullReportCharCount({});
    expect(count).toBeGreaterThan(0);
  });

  it("有标题和机构 → 字符数更多", () => {
    const base = estimateFullReportCharCount({});
    const withTitle = estimateFullReportCharCount({ title: "Test Title", agency_full: "UNDP" });
    expect(withTitle).toBeGreaterThan(base);
  });

  it("有 UNSPSC 码 → 增加字符数", () => {
    const base = estimateFullReportCharCount({});
    const withCodes = estimateFullReportCharCount({
      unspsc_codes: [{ code: "12345678", name: "Test" }],
    });
    expect(withCodes).toBeGreaterThan(base);
  });

  it("完整行 → 覆盖所有分支", () => {
    const count = estimateFullReportCharCount(fullRow);
    expect(count).toBeGreaterThan(3000);
  });

  it("有 source_url → 增加字符数", () => {
    const base = estimateFullReportCharCount({});
    const withUrl = estimateFullReportCharCount({ source_url: "https://example.com" });
    expect(withUrl).toBeGreaterThan(base);
  });

  it("有 description_cn → 增加字符数", () => {
    const base = estimateFullReportCharCount({});
    const withCn = estimateFullReportCharCount({ description_cn: "中文描述" });
    expect(withCn).toBeGreaterThan(base);
  });

  it("有 description_other → 增加字符数", () => {
    const base = estimateFullReportCharCount({});
    const withOther = estimateFullReportCharCount({ description_other: "Autre description" });
    expect(withOther).toBeGreaterThan(base);
  });

  it("有 technical_hurdles → 增加字符数", () => {
    const base = estimateFullReportCharCount({});
    const withHurdles = estimateFullReportCharCount({ technical_hurdles: "Complex requirements" });
    expect(withHurdles).toBeGreaterThan(base);
  });

  it("有 supplier_conditions → 增加字符数", () => {
    const base = estimateFullReportCharCount({});
    const withCond = estimateFullReportCharCount({ supplier_conditions: "Must have ISO certification" });
    expect(withCond).toBeGreaterThan(base);
  });

  it("有 eligibility → 增加字符数", () => {
    const base = estimateFullReportCharCount({});
    const withElig = estimateFullReportCharCount({ eligibility: "Open to international bidders" });
    expect(withElig).toBeGreaterThan(base);
  });

  it("有 remark → 增加字符数", () => {
    const base = estimateFullReportCharCount({});
    const withRemark = estimateFullReportCharCount({ remark: "Internal note" });
    expect(withRemark).toBeGreaterThan(base);
  });

  it("有 training_link → 增加字符数", () => {
    const base = estimateFullReportCharCount({});
    const withTraining = estimateFullReportCharCount({ training_link: "https://training.com" });
    expect(withTraining).toBeGreaterThan(base);
  });

  it("ai_products 为字符串数组 → 正确处理", () => {
    const withStringProducts = estimateFullReportCharCount({
      ai_products: ["Product A", "Product B"],
    });
    expect(withStringProducts).toBeGreaterThan(0);
  });

  it("ai_analysis.risks 为对象数组 → 正确处理", () => {
    const withObjRisks = estimateFullReportCharCount({
      ai_analysis: { risks: [{ type: "high", desc: "Seismic" }] },
    });
    expect(withObjRisks).toBeGreaterThan(0);
  });

  it("ai_analysis.advantages 为对象数组 → 正确处理", () => {
    const withObjAdv = estimateFullReportCharCount({
      ai_analysis: { advantages: [{ type: "cost", desc: "Low cost" }] },
    });
    expect(withObjAdv).toBeGreaterThan(0);
  });
});

describe("buildBidReportPreviewText", () => {
  it("中文 + 有 description_cn → 返回中文段落", () => {
    const sections = buildBidReportPreviewText({ description_cn: "中文描述" }, "zh");
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toContain("中文");
    expect(sections[0].body).toBe("中文描述");
  });

  it("中文 + 无 description_cn → 返回空数组", () => {
    const sections = buildBidReportPreviewText({}, "zh");
    expect(sections).toHaveLength(0);
  });

  it("英文 + 有 description → 返回英文段落", () => {
    const sections = buildBidReportPreviewText({ description: "English description" }, "en");
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toContain("Description");
    expect(sections[0].body).toBe("English description");
  });

  it("英文 + 无 description → 返回空数组", () => {
    const sections = buildBidReportPreviewText({}, "en");
    expect(sections).toHaveLength(0);
  });

  it("默认 lang=zh", () => {
    const sections = buildBidReportPreviewText({ description_cn: "测试" });
    expect(sections).toHaveLength(1);
  });
});
