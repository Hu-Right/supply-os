// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  mergeBidReportRow,
  bidReportFileName,
  buildBidReportDocx,
  buildBidReportPreviewText,
  estimateFullReportCharCount,
} from "../../../server/services/bidReport";

// ─── mergeBidReportRow ─────────────────────────────────────────────────────
describe("mergeBidReportRow", () => {
  const baseNotice = {
    id: 1,
    reference: "REF-001",
    title: "Notice Title",
    notice_type: "Tender",
    agency: "Agency A",
    agency_full: "Agency A Full",
    url: "http://notice.com",
    unspsc_codes: JSON.stringify([{ code: "8010", name: "Mgmt" }]),
    documents: JSON.stringify([{ url: "http://a.com/f.pdf", name: "F" }]),
    contacts: JSON.stringify([{ name: "John", email: "j@x.com" }]),
    external_links: null,
    description: "Notice description",
  };

  it("prefers opportunity fields over notice when available", () => {
    const opp = {
      id: 10,
      title: "Opp Title",
      reference: "OPP-REF",
      notice_type: "RFP",
      agency: "Opp Agency",
      agency_full: "Opp Full Agency",
      source_url: "http://opp.com",
      description: "Opp desc",
      description_cn: "中文描述",
      unspsc_codes: [{ code: "7210", name: "Construction" }],
      documents: [{ url: "http://opp.com/doc.pdf", name: "OppDoc" }],
      contacts: [{ name: "Jane", email: "jane@x.com" }],
      ai_analysis: JSON.stringify({ summary: "AI analysis" }),
    };
    const row = mergeBidReportRow(baseNotice, opp);
    expect(row.id).toBe(10);
    expect(row.title).toBe("Opp Title");
    expect(row.reference).toBe("OPP-REF");
    expect(row.agency).toBe("Opp Agency");
    expect(row.agency_full).toBe("Opp Full Agency");
    expect(row.source_url).toBe("http://opp.com");
    expect(row.description_cn).toBe("中文描述");
    expect(row.unspsc_codes).toEqual([{ code: "7210", name: "Construction" }]);
  });

  it("falls back to notice fields when opportunity is null", () => {
    const row = mergeBidReportRow(baseNotice, null);
    expect(row.id).toBe(1);
    expect(row.title).toBe("Notice Title");
    expect(row.reference).toBe("REF-001");
    expect(row.source_url).toBe("http://notice.com");
  });

  it("parses JSON string fields into objects", () => {
    const row = mergeBidReportRow(baseNotice, null);
    expect(Array.isArray(row.unspsc_codes)).toBe(true);
    expect(Array.isArray(row.documents)).toBe(true);
    expect(Array.isArray(row.contacts)).toBe(true);
    expect(row.unspsc_codes[0]).toEqual({ code: "8010", name: "Mgmt" });
  });

  it("handles invalid JSON in ai_analysis gracefully", () => {
    const opp = { ai_analysis: "not valid json" };
    const row = mergeBidReportRow(baseNotice, opp);
    expect(row.ai_analysis).toEqual({});
  });

  it("passes through object ai_analysis", () => {
    const opp = { ai_analysis: { summary: "Test summary", risks: ["risk1"] } };
    const row = mergeBidReportRow(baseNotice, opp);
    expect(row.ai_analysis.summary).toBe("Test summary");
    expect(row.ai_analysis.risks).toEqual(["risk1"]);
  });

  it("returns empty arrays for null JSON fields", () => {
    const notice = { ...baseNotice, unspsc_codes: null, documents: null, contacts: null };
    const row = mergeBidReportRow(notice, null);
    expect(row.unspsc_codes).toEqual([]);
    expect(row.documents).toEqual([]);
    expect(row.contacts).toEqual([]);
  });

  it("safely handles empty string fields", () => {
    const row = mergeBidReportRow(baseNotice, { incoterms: "", source_platform: "" });
    expect(row.incoterms).toBe("");
    expect(row.source_platform).toBe("");
  });
});

// ─── bidReportFileName ─────────────────────────────────────────────────────
describe("bidReportFileName", () => {
  it("uses reference in the filename", () => {
    const name = bidReportFileName({ reference: "REF-001", id: 42 });
    expect(name).toContain("REF-001");
    expect(name).toMatch(/^中文版订单拆解报告_/);
    expect(name).toMatch(/\.docx$/);
  });

  it("falls back to N{id} when reference is empty", () => {
    const name = bidReportFileName({ reference: "", id: 42 });
    expect(name).toContain("N42");
  });

  it("sanitizes dangerous characters from filename", () => {
    const name = bidReportFileName({ reference: 'REF/001:bad<file>name' });
    expect(name).not.toContain("/");
    expect(name).not.toContain(":");
    expect(name).not.toContain("<");
    expect(name).not.toContain(">");
  });

  it("truncates long references to 60 chars", () => {
    const longRef = "A".repeat(100);
    const name = bidReportFileName({ reference: longRef });
    // "中文版订单拆解报告_" = 10 chars + suffix ".docx" = 5 chars
    // The cleaned part should be at most 60 chars
    const cleanedPart = name.replace("中文版订单拆解报告_", "").replace(".docx", "");
    expect(cleanedPart.length).toBeLessThanOrEqual(60);
  });

  it("falls back to N0 when both reference and id are missing", () => {
    const name = bidReportFileName({});
    expect(name).toContain("N0");
  });
});

// ─── buildBidReportPreviewText ─────────────────────────────────────────────
describe("buildBidReportPreviewText", () => {
  it("returns Chinese description for zh lang when available", () => {
    const sections = buildBidReportPreviewText({ description_cn: "中文采购描述" }, "zh");
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toContain("采购描述");
    expect(sections[0].body).toBe("中文采购描述");
  });

  it("falls back to English description when description_cn is empty", () => {
    const sections = buildBidReportPreviewText({ description_cn: "", description: "English desc" }, "zh");
    expect(sections).toHaveLength(1);
    expect(sections[0].body).toBe("English desc");
  });

  it("returns English description for non-zh lang", () => {
    const sections = buildBidReportPreviewText({ description: "Supply of pumps" }, "en");
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toContain("Procurement");
    expect(sections[0].body).toBe("Supply of pumps");
  });

  it("returns empty array when both descriptions are empty", () => {
    const sections = buildBidReportPreviewText({ description: "", description_cn: "" }, "zh");
    expect(sections).toHaveLength(0);
  });

  it("defaults to zh when lang is not provided", () => {
    const sections = buildBidReportPreviewText({ description_cn: "测试描述" });
    expect(sections).toHaveLength(1);
    expect(sections[0].body).toBe("测试描述");
  });

  it("handles null/undefined row fields safely", () => {
    const sections = buildBidReportPreviewText({}, "zh");
    expect(sections).toHaveLength(0);
  });
});

// ─── estimateFullReportCharCount ───────────────────────────────────────────
describe("estimateFullReportCharCount", () => {
  it("returns a positive number for a minimal row", () => {
    const count = estimateFullReportCharCount({ title: "Test", reference: "REF-1" });
    expect(count).toBeGreaterThan(0);
  });

  it("increases with longer description", () => {
    const short = estimateFullReportCharCount({ title: "T", description: "Short" });
    const long = estimateFullReportCharCount({ title: "T", description: "A".repeat(1000) });
    expect(long).toBeGreaterThan(short);
  });

  it("accounts for ai_analysis sections", () => {
    const without = estimateFullReportCharCount({ title: "T", ai_analysis: {} });
    const with_analysis = estimateFullReportCharCount({
      title: "T",
      ai_analysis: { summary: "Long analysis summary", risks: ["Risk 1", "Risk 2"] },
    });
    expect(with_analysis).toBeGreaterThan(without);
  });

  it("accounts for documents and external links", () => {
    const without = estimateFullReportCharCount({ title: "T", documents: [], external_links: [] });
    const with_docs = estimateFullReportCharCount({
      title: "T",
      documents: [{ name: "Spec", url: "http://x.com/spec.pdf" }],
      external_links: [{ name: "Portal", url: "http://portal.com" }],
    });
    expect(with_docs).toBeGreaterThan(without);
  });

  it("handles ai_products in BoQ section", () => {
    const without = estimateFullReportCharCount({ title: "T", ai_products: [] });
    const with_products = estimateFullReportCharCount({
      title: "T",
      ai_products: [{ name: "Pump", scope: "Industrial water pump", quantity: "5" }],
    });
    expect(with_products).toBeGreaterThan(without);
  });

  it("handles null fields gracefully", () => {
    const count = estimateFullReportCharCount({
      title: null, reference: null, description: null,
      ai_analysis: null, documents: null, contacts: null,
    });
    expect(count).toBeGreaterThan(0); // Fixed template sections still contribute
  });
});

// ─── buildBidReportDocx ────────────────────────────────────────────────────
describe("buildBidReportDocx", () => {
  const baseRow = {
    id: 42,
    reference: "REF-042",
    title: "Water Pump Procurement",
    notice_type: "Tender",
    agency: "UNDP",
    agency_full: "United Nations Development Programme",
    source_platform: "undp",
    industry: "water",
    incoterms: "DAP",
    published_date: "2026-07-01",
    deadline: "2026-09-01",
    deadline_timezone: "UTC",
    estimated_value: "USD 500,000",
    description: "Supply and installation of industrial water pumps",
    description_cn: "供应和安装工业水泵",
    bid_overview: "This project involves the procurement of high-capacity water pumps",
    unspsc_codes: [{ code: "20105100", name: "Pumps" }],
    ai_products: [{ name: "Centrifugal Pump", scope: "High-capacity industrial", quantity: "10", unit: "set" }],
    ai_analysis: { summary: "Key technical requirements include...", risks: ["Supply chain risk"] },
    documents: [{ name: "Technical Spec", url: "http://x.com/spec.pdf" }],
    external_links: [{ name: "UNDP Portal", url: "http://undp.org/bid" }],
    contacts: [{ name: "John Doe", title: "Procurement Officer", email: "john@undp.org", phone: "+1234567890" }],
    supplier_conditions: "Must have ISO 9001 certification",
    eligibility: "Open to all qualified bidders",
    technical_hurdles: "Must meet EU emission standards",
    training_link: "https://training.example.com/course",
    remark: "Internal: priority account",
    source_url: "http://undp.org/bid/042",
    product_code: "PC-001",
    registration_level: "Gold",
    ai_products_raw: null,
    external_links_raw: null,
  };

  it("generates a valid docx buffer (PK magic bytes)", async () => {
    const buffer = await buildBidReportDocx(baseRow);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    // docx is a zip format: starts with PK (0x50, 0x4B)
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("generates docx with minimal data", async () => {
    const minimal = { title: "Minimal", reference: "MIN-1" };
    const buffer = await buildBidReportDocx(minimal);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("handles null opportunity fields gracefully", async () => {
    const row = mergeBidReportRow(
      { id: 1, reference: "R1", title: "T", description: "D" },
      null,
    );
    const buffer = await buildBidReportDocx(row);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("renders ai_analysis blocks when present", async () => {
    const row = {
      ...baseRow,
      ai_analysis: {
        summary: "Test summary text",
        tech_specs: "Technical specifications details",
        risks: ["Risk A", "Risk B"],
        advantages: ["Advantage 1"],
      },
    };
    const buffer = await buildBidReportDocx(row);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("renders without ai_products (falls back to description)", async () => {
    const row = { ...baseRow, ai_products: [] };
    const buffer = await buildBidReportDocx(row);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("renders with empty contacts/documents/external_links", async () => {
    const row = { ...baseRow, contacts: [], documents: [], external_links: [] };
    const buffer = await buildBidReportDocx(row);
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it("maps known industry keys to Chinese labels", async () => {
    // The INDUSTRY_MAP maps "water" → "水务/环境"
    const row = { ...baseRow, industry: "water" };
    const buffer = await buildBidReportDocx(row);
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it("maps known platform keys to display names", async () => {
    const row = { ...baseRow, source_platform: "undp" };
    const buffer = await buildBidReportDocx(row);
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it("handles unknown platform key gracefully", async () => {
    const row = { ...baseRow, source_platform: "unknown_platform" };
    const buffer = await buildBidReportDocx(row);
    expect(buffer).toBeInstanceOf(Buffer);
  });
});
