import { describe, it, expect } from "vitest";
import { noticeTypeKey } from "@/features/procurement/notice-type";

// 用例值全部来自 crm_bid_notices / crm_bid_opportunities 两表 notice_type 实测去重结果
describe("noticeTypeKey", () => {
  it.each([
    "invitation_for_bids",
    "ITB",
    "Invitation to bid",
    "招标邀请",
    "Tender Notice",
    "Request for Bid(Open-Tender)",
    "Invitation to Tender (ITT)",
    "投标邀请书 (ITB) - 旨在建立框架协议 (Frame Agreement)。",
    "公开招标（Open Procedure)",
  ])("maps %s to itb", (raw) => {
    expect(noticeTypeKey(raw)).toBe("procurement_type_itb");
  });

  it.each([
    "报价征询",
    "Request for quotation",
    "RFQ",
    "询价书",
    " Request for Quotation (RFQ)",
    "报价请求 (RFQ) - 属于重新招标 (Re-Bid)。",
  ])("maps %s to rfq", (raw) => {
    expect(noticeTypeKey(raw)).toBe("procurement_type_rfq");
  });

  it.each([
    "Request for proposal",
    "RFP",
    "提案征集 (RFP) / Request for Proposal",
    "Negotiated Request for Proposal (BPS)",
  ])("maps %s to rfp", (raw) => {
    expect(noticeTypeKey(raw)).toBe("procurement_type_rfp");
  });

  it.each([
    "Request for Expression of Interest",
    "EOI",
    "Request for EOI",
    "Expression of interest",
    "意向表达 (EOI) - 这是预审阶段，只有通过的企业才会收到正式标书。",
  ])("maps %s to eoi", (raw) => {
    expect(noticeTypeKey(raw)).toBe("procurement_type_eoi");
  });

  it.each([
    "invitation_for_prequalification",
    "Invitation for Prequalification",
    "PQ",
    "PRE",
    "Request for pre-qualification",
    "Prequalification and Tender Notice",
    "Request for Qualifications (BPS)",
  ])("maps %s to prequalification", (raw) => {
    expect(noticeTypeKey(raw)).toBe("procurement_type_prequalification");
  });

  it.each(["Call for individual consultants", "IC"])("maps %s to consultant", (raw) => {
    expect(noticeTypeKey(raw)).toBe("procurement_type_consultant");
  });

  it.each(["Request for information", "RFI", "Request for Information (BPS)"])(
    "maps %s to rfi",
    (raw) => {
      expect(noticeTypeKey(raw)).toBe("procurement_type_rfi");
    }
  );

  it.each(["General Procurement Notice", "GPN"])("maps %s to gpn", (raw) => {
    expect(noticeTypeKey(raw)).toBe("procurement_type_gpn");
  });

  // 长尾脏值/空值：返回 null，由调用方回退显示原始值
  it.each(["", "Not set", "未提供", "goods", "Timber Auction", "动态采购系统", "United Nations Development Programme"])(
    "returns null for unmapped value %s",
    (raw) => {
      expect(noticeTypeKey(raw)).toBeNull();
    }
  );

  it("returns null for undefined", () => {
    expect(noticeTypeKey(undefined)).toBeNull();
  });
});
