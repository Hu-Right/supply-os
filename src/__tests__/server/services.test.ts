// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { hashPassword } from "../../../server/services/auth";
import { normalizeNoticeDetailPayload, findQualifiedOpportunityForNotice } from "../../../server/services/notices";
import { mapSupplierRow } from "../../../server/services/suppliers";

// ─── hashPassword ───────────────────────────────────────────────────────────
describe("hashPassword", () => {
  it("produces consistent SHA-256 hex hash", () => {
    const hash1 = hashPassword("test123");
    const hash2 = hashPassword("test123");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("produces different hashes for different passwords", () => {
    expect(hashPassword("abc")).not.toBe(hashPassword("def"));
  });

  it("is not plaintext", () => {
    expect(hashPassword("mypassword")).not.toBe("mypassword");
  });
});

// ─── normalizeNoticeDetailPayload ───────────────────────────────────────────
describe("normalizeNoticeDetailPayload", () => {
  const baseNotice = {
    id: 1,
    notice_id: "N-001",
    reference: "REF-001",
    title: "Original Title",
    notice_type: "Tender",
    agency: "Agency A",
    organization: "Org B",
    country: "Brazil",
    deadline: "2026-08-01",
    deadline_ts: 1785000000,
    estimated_value: "BRL 100000",
    description: "Original description",
    contacts: JSON.stringify([{ name: "John", email: "j@x.com" }]),
    documents: JSON.stringify([{ url: "http://a.com/f.pdf", name: "F" }]),
    procurement_files: null,
    external_links: null,
    unspsc_codes: JSON.stringify([{ code: "8010", name: "Mgmt" }]),
    url: "http://source.com",
    converted_opp_id: null,
  };

  it("returns notice data with core_locked=false when unlocked", () => {
    const result = normalizeNoticeDetailPayload(baseNotice, { unlock_type: "free" });
    expect(result.core_locked).toBe(false);
    expect(result.unlock_type).toBe("free");
  });

  it("prefers opportunity fields over notice when available", () => {
    const opportunity = {
      id: 10,
      title: "Opp Title",
      reference: "OPP-REF",
      notice_type: "RFP",
      country: "USA",
      deadline: "2026-09-01",
      deadline_ts: 1788000000,
      estimated_value: "USD 200000",
      description: "Opp description",
      agency: "Opp Agency",
      agency_full: "Opp Full Agency",
      source_url: "http://opp.com",
      contacts: [{ name: "Jane", email: "jane@x.com" }],
      documents: [{ url: "http://opp.com/doc.pdf", name: "OppDoc" }],
      external_links: null,
      unspsc_codes: [{ code: "7210", name: "Construction" }],
      is_qualified: 1,
      status: "won",
      audit_status: 1,
      review_status: "approved",
      priority: "high",
    };
    const result = normalizeNoticeDetailPayload(baseNotice, { unlock_type: "single" }, opportunity);
    expect(result.title).toBe("Opp Title");
    expect(result.reference).toBe("OPP-REF");
    expect(result.agency).toBe("Opp Full Agency");
    expect(result.source_url).toBe("http://opp.com");
    expect(result.opportunity_info).not.toBeNull();
    expect(result.opportunity_info.id).toBe(10);
  });

  it("falls back to notice fields when opportunity is null", () => {
    const result = normalizeNoticeDetailPayload(baseNotice, { unlock_type: "free" }, null);
    expect(result.title).toBe("Original Title");
    expect(result.agency).toBe("Agency A");
    expect(result.opportunity_info).toBeNull();
  });

  it("normalizes documents and removes procurement_files", () => {
    const result = normalizeNoticeDetailPayload(baseNotice, { unlock_type: "free" });
    expect(result.procurement_files).toEqual([]);
    expect(Array.isArray(result.documents)).toBe(true);
  });

  it("includes core_info block", () => {
    const result = normalizeNoticeDetailPayload(baseNotice, { unlock_type: "free" });
    expect(result.core_info).toBeDefined();
    expect(result.core_info.notice_id).toBe("N-001");
    expect(result.core_info.agency).toBe("Agency A");
  });
});

// ─── findQualifiedOpportunityForNotice ──────────────────────────────────────
describe("findQualifiedOpportunityForNotice", () => {
  it("returns null when no qualified opportunity found", async () => {
    const dbPool = { query: vi.fn().mockResolvedValue([[]]) };
    const notice = { converted_opp_id: null, notice_id: null, reference: null };
    const result = await findQualifiedOpportunityForNotice(dbPool, notice);
    expect(result).toBeNull();
  });

  it("searches by converted_opp_id first", async () => {
    const opp = { id: 5, title: "Found Opp", is_qualified: 1 };
    const dbPool = { query: vi.fn().mockResolvedValue([[opp]]) };
    const notice = { converted_opp_id: 5, notice_id: "N1", reference: "R1" };
    const result = await findQualifiedOpportunityForNotice(dbPool, notice);
    expect(result).toEqual(opp);
    expect(dbPool.query).toHaveBeenCalledTimes(1);
    expect(dbPool.query.mock.calls[0][0]).toContain("WHERE id = ?");
  });

  it("falls back to source_notice_id search", async () => {
    const opp = { id: 8, title: "By Notice ID" };
    const dbPool = {
      query: vi.fn()
        .mockResolvedValueOnce([[]]) // converted_opp_id miss
        .mockResolvedValueOnce([[opp]]), // source_notice_id hit
    };
    const notice = { converted_opp_id: 99, notice_id: "N-123", reference: "R-1" };
    const result = await findQualifiedOpportunityForNotice(dbPool, notice);
    expect(result).toEqual(opp);
    expect(dbPool.query).toHaveBeenCalledTimes(2);
  });

  it("falls back to reference search", async () => {
    const opp = { id: 12, title: "By Reference" };
    const dbPool = {
      query: vi.fn().mockResolvedValueOnce([[opp]]), // reference hit
    };
    // converted_opp_id=0 skips first check, notice_id=null skips second, only reference queried
    const notice = { converted_opp_id: 0, notice_id: null, reference: "REF-XYZ" };
    const result = await findQualifiedOpportunityForNotice(dbPool, notice);
    expect(result).toEqual(opp);
    expect(dbPool.query).toHaveBeenCalledTimes(1);
    expect(dbPool.query.mock.calls[0][0]).toContain("WHERE reference = ?");
  });
});

// ─── mapSupplierRow ─────────────────────────────────────────────────────────
describe("mapSupplierRow", () => {
  const baseRow = {
    id: 1,
    company_name: "测试公司",
    industry: "制造业",
    main_product: "产品A,产品B",
    certification: "ISO9001,ISO14001",
    contact_name: "张三",
    email: "zhangsan@test.com",
    telephone: "13812345678",
  };

  it("maps DB row to Supplier DTO", () => {
    const result = mapSupplierRow(baseRow, null);
    expect(result.id).toBe("sup-db-1");
    expect(result.nameZh).toBe("测试公司");
    expect(result.industryZh).toBe("制造业");
    expect(result.mainProductsZh).toEqual(["产品A", "产品B"]);
    expect(result.complianceLabelsZh).toEqual(["ISO9001", "ISO14001"]);
    expect(result.contactPerson).toBe("张三");
  });

  it("masks email and phone", () => {
    const result = mapSupplierRow(baseRow, null);
    expect(result.contactEmail).toContain("***");
    expect(result.contactPhone).toContain("****");
    expect(result.contactEmail).not.toBe("zhangsan@test.com");
  });

  it("uses translation when provided", () => {
    const tr = {
      industry_tr: "Manufacturing",
      main_products_tr: "Product A,Product B",
      certification_tr: "ISO9001",
    };
    const result = mapSupplierRow(baseRow, tr);
    expect(result.industryEn).toBe("Manufacturing");
    expect(result.mainProductsEn).toEqual(["Product A", "Product B"]);
    expect(result.complianceLabelsEn).toEqual(["ISO9001"]);
  });

  it("falls back to zh values when translation empty", () => {
    const tr = { industry_tr: "", main_products_tr: "", certification_tr: "" };
    const result = mapSupplierRow(baseRow, tr);
    expect(result.industryEn).toBe("制造业");
    expect(result.mainProductsEn).toEqual(["产品A", "产品B"]);
  });

  it("uses main_product first item as industry fallback", () => {
    const row = { ...baseRow, industry: "" };
    const result = mapSupplierRow(row, null);
    expect(result.industryZh).toBe("产品A");
  });
});
