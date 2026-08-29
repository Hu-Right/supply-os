import { describe, it, expect } from "vitest";
import { noticeTypeKey } from "./notice-type";

describe("noticeTypeKey — 短代码精确匹配", () => {
  it("ITB → procurement_type_itb", () => {
    expect(noticeTypeKey("ITB")).toBe("procurement_type_itb");
  });

  it("RFQ（大小写不敏感）→ procurement_type_rfq", () => {
    expect(noticeTypeKey("rfq")).toBe("procurement_type_rfq");
    expect(noticeTypeKey("RFQ")).toBe("procurement_type_rfq");
  });

  it("EOI → procurement_type_eoi", () => {
    expect(noticeTypeKey("EOI")).toBe("procurement_type_eoi");
  });

  it("GPN → procurement_type_gpn", () => {
    expect(noticeTypeKey("GPN")).toBe("procurement_type_gpn");
  });
});

describe("noticeTypeKey — 子串规则匹配", () => {
  it("含 'quotation' → RFQ", () => {
    expect(noticeTypeKey("Request for Quotation")).toBe("procurement_type_rfq");
  });

  it("含 '招标' → ITB", () => {
    expect(noticeTypeKey("国际招标公告")).toBe("procurement_type_itb");
  });

  it("含 'contract award' → contract_award", () => {
    expect(noticeTypeKey("Contract Award Notice")).toBe("procurement_type_contract_award");
  });

  it("含 '框架协议' → framework", () => {
    expect(noticeTypeKey("Framework Agreement for Supplies")).toBe("procurement_type_framework");
  });

  it("含 '意向表达' → EOI", () => {
    expect(noticeTypeKey("Expression of Interest")).toBe("procurement_type_eoi");
  });

  it("含 '资格预审' → prequalification", () => {
    expect(noticeTypeKey("Pre-Qualification Notice")).toBe("procurement_type_prequalification");
  });
});

describe("noticeTypeKey — 空值/未知", () => {
  it("null → null", () => {
    expect(noticeTypeKey(null)).toBeNull();
    expect(noticeTypeKey(undefined)).toBeNull();
    expect(noticeTypeKey("")).toBeNull();
  });

  it("纯空白 → null", () => {
    expect(noticeTypeKey("   ")).toBeNull();
  });

  it("无法识别的长尾值 → null", () => {
    expect(noticeTypeKey("xyz_unknown_type")).toBeNull();
  });
});

describe("noticeTypeKey — 优先级验证", () => {
  it("ITB 优先于 EOI（含'框架协议'的 ITB 不被 EOI 误匹配）", () => {
    // "投标邀请书(ITB)-框架协议" 应归 ITB 而非 framework
    expect(noticeTypeKey("投标邀请书(ITB)")).toBe("procurement_type_itb");
  });

  it("RFQ 优先于 request", () => {
    expect(noticeTypeKey("Request for Quotation")).toBe("procurement_type_rfq");
  });
});
