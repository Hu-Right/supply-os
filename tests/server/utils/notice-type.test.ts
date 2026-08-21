/**
 * server/utils/notice-type.ts 测试
 */
import { describe, it, expect } from "vitest";
import { normalizeNoticeType, isKnownNoticeType } from "../../../server/utils/notice-type";

describe("normalizeNoticeType", () => {
  it("空值返回 OTHER", () => {
    expect(normalizeNoticeType(null)).toBe("OTHER");
    expect(normalizeNoticeType(undefined)).toBe("OTHER");
    expect(normalizeNoticeType("")).toBe("OTHER");
  });

  it("标准短代码直接映射", () => {
    expect(normalizeNoticeType("ITB")).toBe("ITB");
    expect(normalizeNoticeType("RFQ")).toBe("RFQ");
    expect(normalizeNoticeType("RFP")).toBe("RFP");
    expect(normalizeNoticeType("EOI")).toBe("EOI");
    expect(normalizeNoticeType("AWARD")).toBe("AWARD");
  });

  it("ITT 归一化为 ITB", () => {
    expect(normalizeNoticeType("ITT")).toBe("ITB");
  });

  it("大小写不敏感", () => {
    expect(normalizeNoticeType("itb")).toBe("ITB");
    expect(normalizeNoticeType("rfq")).toBe("RFQ");
  });

  it("关键词匹配 — EOI", () => {
    expect(normalizeNoticeType("Expression of Interest")).toBe("EOI");
    expect(normalizeNoticeType("意向表达")).toBe("EOI");
    expect(normalizeNoticeType("意向征集")).toBe("EOI");
  });

  it("关键词匹配 — RFQ", () => {
    expect(normalizeNoticeType("Request for Quotation")).toBe("RFQ");
    expect(normalizeNoticeType("报价邀请")).toBe("RFQ");
  });

  it("关键词匹配 — RFP", () => {
    expect(normalizeNoticeType("Request for Proposal")).toBe("RFP");
    expect(normalizeNoticeType("提案")).toBe("RFP");
  });

  it("关键词匹配 — AWARD", () => {
    expect(normalizeNoticeType("Contract Award")).toBe("AWARD");
    expect(normalizeNoticeType("授标公告")).toBe("AWARD");
    expect(normalizeNoticeType("中标")).toBe("AWARD");
  });

  it("关键词匹配 — ITB（solicitation）", () => {
    expect(normalizeNoticeType("Solicitation")).toBe("ITB");
    expect(normalizeNoticeType("招标")).toBe("ITB");
  });

  it("关键词匹配 — PQ", () => {
    expect(normalizeNoticeType("Pre-Qualification")).toBe("PQ");
    expect(normalizeNoticeType("资格预审")).toBe("PQ");
  });

  it("关键词匹配 — IC", () => {
    expect(normalizeNoticeType("Consultant")).toBe("IC");
    expect(normalizeNoticeType("顾问")).toBe("IC");
  });

  it("关键词匹配 — RFI", () => {
    expect(normalizeNoticeType("Request for Information")).toBe("RFI");
    expect(normalizeNoticeType("信息征询")).toBe("RFI");
  });

  it("关键词匹配 — GPN", () => {
    expect(normalizeNoticeType("General Procurement Notice")).toBe("GPN");
  });

  it("扩展类型 — PIN", () => {
    expect(normalizeNoticeType("Prior Information Notice")).toBe("PIN");
    expect(normalizeNoticeType("事前信息通知")).toBe("PIN");
  });

  it("扩展类型 — CONTRACT_NOTICE", () => {
    expect(normalizeNoticeType("Contract Notice")).toBe("CONTRACT_NOTICE");
    expect(normalizeNoticeType("合同通知")).toBe("CONTRACT_NOTICE");
  });

  it("扩展类型 — THRESHOLD", () => {
    expect(normalizeNoticeType("Threshold Procedure")).toBe("THRESHOLD");
    expect(normalizeNoticeType("门槛程序")).toBe("THRESHOLD");
  });

  it("扩展类型 — NEGOTIATED", () => {
    expect(normalizeNoticeType("Negotiated Procedure")).toBe("NEGOTIATED");
    expect(normalizeNoticeType("谈判采购")).toBe("NEGOTIATED");
  });

  it("Non-Competitive 归为 OTHER", () => {
    expect(normalizeNoticeType("Non-Competitive")).toBe("OTHER");
    expect(normalizeNoticeType("NonCompetitive")).toBe("OTHER");
  });

  it("Competitive 归为 COMPETITIVE", () => {
    expect(normalizeNoticeType("Competitive Bidding")).toBe("COMPETITIVE");
    expect(normalizeNoticeType("公开招标")).toBe("COMPETITIVE");
  });

  it("EU 分类 — SERVICES/SUPPLIES/WORKS", () => {
    expect(normalizeNoticeType("Servicios de consultoría")).toBe("SERVICES");
    expect(normalizeNoticeType("Suministro de equipos")).toBe("SUPPLIES");
    expect(normalizeNoticeType("Obras de construcción")).toBe("WORKS");
  });

  it("未知类型返回 OTHER", () => {
    expect(normalizeNoticeType("xyz_unknown_type")).toBe("OTHER");
  });

  it("幂等性：AWARD 输入仍为 AWARD", () => {
    expect(normalizeNoticeType("AWARD")).toBe("AWARD");
  });
});

describe("isKnownNoticeType", () => {
  it("空值返回 false", () => {
    expect(isKnownNoticeType(null)).toBe(false);
    expect(isKnownNoticeType(undefined)).toBe(false);
    expect(isKnownNoticeType("")).toBe(false);
  });

  it("OTHER 显式为合法", () => {
    expect(isKnownNoticeType("OTHER")).toBe(true);
    expect(isKnownNoticeType("other")).toBe(true);
  });

  it("已知类型返回 true", () => {
    expect(isKnownNoticeType("ITB")).toBe(true);
    expect(isKnownNoticeType("RFQ")).toBe(true);
    expect(isKnownNoticeType("AWARD")).toBe(true);
    expect(isKnownNoticeType("COMPETITIVE")).toBe(true);
  });

  it("未知类型返回 false", () => {
    expect(isKnownNoticeType("xyz_unknown")).toBe(false);
  });
});
