// @vitest-environment node
import { describe, it, expect } from "vitest";
import { normalizeNoticeType } from "../../../server/services/meilisearch";

// ─── normalizeNoticeType ───────────────────────────────────────────────────
describe("normalizeNoticeType", () => {
  it("returns OTHER for null/undefined/empty", () => {
    expect(normalizeNoticeType(null)).toBe("OTHER");
    expect(normalizeNoticeType(undefined)).toBe("OTHER");
    expect(normalizeNoticeType("")).toBe("OTHER");
  });

  it("maps short codes exactly", () => {
    expect(normalizeNoticeType("ITB")).toBe("ITB");
    expect(normalizeNoticeType("ITT")).toBe("ITB");
    expect(normalizeNoticeType("RFQ")).toBe("RFQ");
    expect(normalizeNoticeType("RFP")).toBe("RFP");
    expect(normalizeNoticeType("EOI")).toBe("EOI");
    expect(normalizeNoticeType("PQ")).toBe("PQ");
    expect(normalizeNoticeType("PRE")).toBe("PQ");
    expect(normalizeNoticeType("IC")).toBe("IC");
    expect(normalizeNoticeType("RFI")).toBe("RFI");
    expect(normalizeNoticeType("GPN")).toBe("GPN");
  });

  it("is case-insensitive for short codes", () => {
    expect(normalizeNoticeType("rfq")).toBe("RFQ");
    expect(normalizeNoticeType("Rfp")).toBe("RFP");
    expect(normalizeNoticeType("eoi")).toBe("EOI");
  });

  it("maps long text patterns", () => {
    expect(normalizeNoticeType("Request for quotation")).toBe("RFQ");
    expect(normalizeNoticeType("Expression of Interest")).toBe("EOI");
    expect(normalizeNoticeType("Request for Proposal")).toBe("RFP");
    expect(normalizeNoticeType("Pre-qualification")).toBe("PQ");
    expect(normalizeNoticeType("Request for Information")).toBe("RFI");
    expect(normalizeNoticeType("General Procurement Notice")).toBe("GPN");
  });

  it("maps Chinese procurement type names", () => {
    expect(normalizeNoticeType("招标")).toBe("ITB");
    expect(normalizeNoticeType("投标")).toBe("ITB");
    expect(normalizeNoticeType("报价")).toBe("RFQ");
    expect(normalizeNoticeType("询价")).toBe("RFQ");
    expect(normalizeNoticeType("意向表达")).toBe("EOI");
    expect(normalizeNoticeType("资格预审")).toBe("PQ");
    expect(normalizeNoticeType("顾问")).toBe("IC");
    expect(normalizeNoticeType("授标")).toBe("AWARD");
    expect(normalizeNoticeType("中标")).toBe("AWARD");
  });

  it("maps contract award notices", () => {
    expect(normalizeNoticeType("Contract Award Notice")).toBe("AWARD");
    expect(normalizeNoticeType("Award Notice")).toBe("AWARD");
  });

  it("maps consultant-related text to IC", () => {
    expect(normalizeNoticeType("Selection of Consultant")).toBe("IC");
  });

  it("returns OTHER for unrecognized text", () => {
    expect(normalizeNoticeType("Some random text")).toBe("OTHER");
    expect(normalizeNoticeType("Notice")).toBe("OTHER");
  });

  it("trims whitespace", () => {
    expect(normalizeNoticeType("  RFQ  ")).toBe("RFQ");
    expect(normalizeNoticeType("  Tender  ")).toBe("ITB");
  });
});
