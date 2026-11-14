/**
 * 授权书内容哈希 / 行业 L1 段解析单测
 * @module tests/unit/lib/services/rfq/authorization-letter
 */
import { describe, it, expect } from "vitest";
import { computeLetterHash } from "@/lib/services/rfq/authorization-letter";
import { demandIndustrySegment } from "@/lib/services/rfq/matching";

const BASE = {
  reference: "OSRFQ-2026-000007",
  revisionNo: 2,
  buyerOrgName: "西安某新能源有限公司",
  projectTitle: "采购光伏组件 10MW",
};

describe("computeLetterHash — 签署所依据内容的指纹", () => {
  it("同输入哈希稳定", () => {
    expect(computeLetterHash(BASE)).toBe(computeLetterHash({ ...BASE }));
  });

  it("版本变化 → 哈希变化（改稿重提后旧签署失效的机理）", () => {
    expect(computeLetterHash(BASE)).not.toBe(computeLetterHash({ ...BASE, revisionNo: 3 }));
  });

  it("标题/主体变化 → 哈希变化", () => {
    expect(computeLetterHash(BASE)).not.toBe(computeLetterHash({ ...BASE, projectTitle: "改过的标题" }));
    expect(computeLetterHash(BASE)).not.toBe(computeLetterHash({ ...BASE, buyerOrgName: "另一家公司" }));
  });
});

describe("demandIndustrySegment — 需求行业 L1 数字段", () => {
  it("UGT-0301 → 03", () => expect(demandIndustrySegment("UGT-0301")).toBe("03"));
  it("UGT-03 → 03", () => expect(demandIndustrySegment("UGT-03")).toBe("03"));
  it("非 UGT 前缀 → null", () => expect(demandIndustrySegment("ABC-0301")).toBeNull());
  it("段非两位数字 → null", () => expect(demandIndustrySegment("UGT-X01")).toBeNull());
  it("空串 → null", () => expect(demandIndustrySegment("")).toBeNull());
});
