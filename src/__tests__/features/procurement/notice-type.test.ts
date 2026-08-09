import { describe, it, expect } from "vitest";
import { noticeTypeKey } from "@/features/procurement/notice-type";

describe("noticeTypeKey", () => {
  describe("short code exact match", () => {
    it("maps ITB to procurement_type_itb", () => {
      expect(noticeTypeKey("ITB")).toBe("procurement_type_itb");
    });

    it("maps ITT to procurement_type_itb", () => {
      expect(noticeTypeKey("ITT")).toBe("procurement_type_itb");
    });

    it("maps RFQ to procurement_type_rfq", () => {
      expect(noticeTypeKey("RFQ")).toBe("procurement_type_rfq");
    });

    it("maps RFP to procurement_type_rfp", () => {
      expect(noticeTypeKey("RFP")).toBe("procurement_type_rfp");
    });

    it("maps EOI to procurement_type_eoi", () => {
      expect(noticeTypeKey("EOI")).toBe("procurement_type_eoi");
    });

    it("maps PQ to procurement_type_prequalification", () => {
      expect(noticeTypeKey("PQ")).toBe("procurement_type_prequalification");
    });

    it("maps PRE to procurement_type_prequalification", () => {
      expect(noticeTypeKey("PRE")).toBe("procurement_type_prequalification");
    });

    it("maps IC to procurement_type_consultant", () => {
      expect(noticeTypeKey("IC")).toBe("procurement_type_consultant");
    });

    it("maps RFI to procurement_type_rfi", () => {
      expect(noticeTypeKey("RFI")).toBe("procurement_type_rfi");
    });

    it("maps GPN to procurement_type_gpn", () => {
      expect(noticeTypeKey("GPN")).toBe("procurement_type_gpn");
    });

    it("maps OTHER to procurement_type_other", () => {
      expect(noticeTypeKey("OTHER")).toBe("procurement_type_other");
    });

    it("is case-insensitive", () => {
      expect(noticeTypeKey("itb")).toBe("procurement_type_itb");
      expect(noticeTypeKey("rfq")).toBe("procurement_type_rfq");
      expect(noticeTypeKey("Rfp")).toBe("procurement_type_rfp");
    });
  });

  describe("pattern matching", () => {
    it("maps quotation to RFQ", () => {
      expect(noticeTypeKey("Request for quotation")).toBe("procurement_type_rfq");
      expect(noticeTypeKey("报价请求")).toBe("procurement_type_rfq");
    });

    it("maps proposal to RFP", () => {
      expect(noticeTypeKey("Request for proposal")).toBe("procurement_type_rfp");
      expect(noticeTypeKey("建议书")).toBe("procurement_type_rfp");
    });

    it("maps pre-qualification", () => {
      expect(noticeTypeKey("Pre-qualification")).toBe("procurement_type_prequalification");
      expect(noticeTypeKey("资格预审")).toBe("procurement_type_prequalification");
    });

    it("maps consultant", () => {
      expect(noticeTypeKey("Selection of Consultant")).toBe("procurement_type_consultant");
      expect(noticeTypeKey("顾问服务")).toBe("procurement_type_consultant");
    });

    it("maps tender/bid to ITB", () => {
      expect(noticeTypeKey("Invitation to Bid")).toBe("procurement_type_itb");
      expect(noticeTypeKey("招标公告")).toBe("procurement_type_itb");
      expect(noticeTypeKey("投标邀请")).toBe("procurement_type_itb");
    });

    it("maps expression of interest to EOI", () => {
      expect(noticeTypeKey("Expression of Interest")).toBe("procurement_type_eoi");
      expect(noticeTypeKey("意向表达")).toBe("procurement_type_eoi");
    });

    it("maps framework agreement", () => {
      expect(noticeTypeKey("Framework Agreement")).toBe("procurement_type_framework");
      expect(noticeTypeKey("框架协议")).toBe("procurement_type_framework");
    });

    it("maps contract award", () => {
      expect(noticeTypeKey("Contract Award Notice")).toBe("procurement_type_contract_award");
      expect(noticeTypeKey("中标通知")).toBe("procurement_type_contract_award");
    });

    it("maps competitive procedures", () => {
      expect(noticeTypeKey("Competitive bidding")).toBe("procurement_type_competitive");
      expect(noticeTypeKey("公开招标")).toBe("procurement_type_competitive");
    });

    it("maps direct contracting", () => {
      expect(noticeTypeKey("Direct Contract")).toBe("procurement_type_direct_contracting");
      expect(noticeTypeKey("直接采购")).toBe("procurement_type_direct_contracting");
    });
  });

  describe("edge cases", () => {
    it("returns null for undefined", () => {
      expect(noticeTypeKey(undefined)).toBeNull();
    });

    it("returns null for null", () => {
      expect(noticeTypeKey(null)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(noticeTypeKey("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      expect(noticeTypeKey("   ")).toBeNull();
    });

    it("returns null for unrecognized values", () => {
      expect(noticeTypeKey("Some random text")).toBeNull();
    });

    it("trims whitespace", () => {
      expect(noticeTypeKey("  ITB  ")).toBe("procurement_type_itb");
    });

    it("handles special characters in input", () => {
      expect(noticeTypeKey("ITB-2024")).toBe("procurement_type_itb");
    });
  });

  describe("priority and precedence", () => {
    it("ITB takes precedence over EOI when both patterns match", () => {
      // "投标邀请书(ITB)-框架协议" contains both ITB and framework patterns
      expect(noticeTypeKey("投标邀请书(ITB)-框架协议")).toBe("procurement_type_itb");
    });

    it("RFQ takes precedence over general request patterns", () => {
      expect(noticeTypeKey("Request for Quotation")).toBe("procurement_type_rfq");
    });

    it("contract_award takes precedence over contract_notice", () => {
      expect(noticeTypeKey("Contract Award")).toBe("procurement_type_contract_award");
    });
  });
});
