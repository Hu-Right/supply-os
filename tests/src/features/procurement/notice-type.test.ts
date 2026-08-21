/**
 * src/features/procurement/notice-type.ts 测试
 */
import { describe, it, expect } from "vitest";
import { noticeTypeKey } from "../../../../src/features/procurement/notice-type";

describe("noticeTypeKey", () => {
  it("空值返回 null", () => {
    expect(noticeTypeKey(null)).toBeNull();
    expect(noticeTypeKey(undefined)).toBeNull();
    expect(noticeTypeKey("")).toBeNull();
    expect(noticeTypeKey("   ")).toBeNull();
  });

  it("标准短代码精确匹配", () => {
    expect(noticeTypeKey("ITB")).toBe("procurement_type_itb");
    expect(noticeTypeKey("RFQ")).toBe("procurement_type_rfq");
    expect(noticeTypeKey("RFP")).toBe("procurement_type_rfp");
    expect(noticeTypeKey("EOI")).toBe("procurement_type_eoi");
    expect(noticeTypeKey("PQ")).toBe("procurement_type_prequalification");
    expect(noticeTypeKey("IC")).toBe("procurement_type_consultant");
    expect(noticeTypeKey("RFI")).toBe("procurement_type_rfi");
    expect(noticeTypeKey("GPN")).toBe("procurement_type_gpn");
    expect(noticeTypeKey("OTHER")).toBe("procurement_type_other");
  });

  it("大小写不敏感", () => {
    expect(noticeTypeKey("itb")).toBe("procurement_type_itb");
    expect(noticeTypeKey("rfq")).toBe("procurement_type_rfq");
  });

  it("扩展类型代码", () => {
    expect(noticeTypeKey("CONTRACT_NOTICE")).toBe("procurement_type_contract_notice");
    expect(noticeTypeKey("COMPETITIVE")).toBe("procurement_type_competitive");
    expect(noticeTypeKey("THRESHOLD")).toBe("procurement_type_threshold");
    expect(noticeTypeKey("PIN")).toBe("procurement_type_pin");
    expect(noticeTypeKey("PMC")).toBe("procurement_type_pmc");
    expect(noticeTypeKey("NEGOTIATED")).toBe("procurement_type_negotiated");
  });

  it("关键词匹配 — 招标/投标", () => {
    expect(noticeTypeKey("Invitation to Bid")).toBe("procurement_type_itb");
    expect(noticeTypeKey("招标公告")).toBe("procurement_type_itb");
  });

  it("关键词匹配 — 报价", () => {
    expect(noticeTypeKey("Request for Quotation")).toBe("procurement_type_rfq");
    expect(noticeTypeKey("报价邀请")).toBe("procurement_type_rfq");
  });

  it("关键词匹配 — 中标/授标", () => {
    expect(noticeTypeKey("Contract Award")).toBe("procurement_type_contract_award");
    expect(noticeTypeKey("中标")).toBe("procurement_type_contract_award");
  });

  it("关键词匹配 — 框架协议", () => {
    expect(noticeTypeKey("Framework Agreement")).toBe("procurement_type_framework");
    expect(noticeTypeKey("框架协议")).toBe("procurement_type_framework");
  });

  it("关键词匹配 — 意向表达", () => {
    expect(noticeTypeKey("Expression of Interest")).toBe("procurement_type_eoi");
    expect(noticeTypeKey("意向征集")).toBe("procurement_type_eoi");
  });

  it("关键词匹配 — 竞争性", () => {
    expect(noticeTypeKey("Competitive Bidding")).toBe("procurement_type_competitive");
    expect(noticeTypeKey("公开招标")).toBe("procurement_type_competitive");
  });

  it("关键词匹配 — 谈判程序", () => {
    expect(noticeTypeKey("Negotiated Procedure")).toBe("procurement_type_negotiated");
    expect(noticeTypeKey("谈判程序")).toBe("procurement_type_negotiated");
  });

  it("无法识别的长尾值返回 null", () => {
    expect(noticeTypeKey("xyz_unknown_garbage")).toBeNull();
  });
});
