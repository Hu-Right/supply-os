/**
 * 供应商相似度打分单测
 *
 * @module tests/unit/lib/services/supplier-similarity
 * @description 钉住三条业务不变量：
 *              1. 品目重叠必须排在「同国家但无关」之前；
 *              2. 行业相似按树前缀深度计算（同 L2 > 同 L1），全码不等不等于 0；
 *              3. 无品目/行业信号时，产品文本重合仍能兜底；相似原因分类正确。
 */
import { describe, it, expect } from "vitest";
import {
  computeSupplierSimilarity,
  industryCodeSimilarity,
  resolveMatchKind,
  type SupplierSimilarityInput,
} from "@/lib/services/supplier-similarity";

function input(overrides: Partial<SupplierSimilarityInput> = {}): SupplierSimilarityInput {
  return {
    commodityCodes: [],
    industryCode: null,
    products: [],
    countryCode: "CN",
    province: "浙江",
    city: "杭州",
    quality: 70,
    ...overrides,
  };
}

describe("computeSupplierSimilarity", () => {
  it("品目重叠的企业必须排在同国家但无关的企业之前", () => {
    const target = input({
      commodityCodes: [
        { code: "UGT-1103010205", confidence: 95 },
        { code: "UGT-11030201", confidence: 95 },
      ],
      industryCode: "UGT-I-03220201",
      products: ["激光切割机", "金属折弯机"],
    });
    const sameCommodity = input({
      commodityCodes: [
        { code: "UGT-1103010205", confidence: 90 },
        { code: "UGT-1104010105", confidence: 80 },
      ],
      industryCode: "UGT-I-03220201",
      products: ["激光切割机", "激光焊接机"],
      quality: 60,
    });
    const sameCountryUnrelated = input({
      commodityCodes: [],
      industryCode: "UGT-I-1302",
      products: ["塑胶花盆", "园艺种植箱"],
      quality: 90,
    });

    const good = computeSupplierSimilarity(target, sameCommodity);
    const bad = computeSupplierSimilarity(target, sameCountryUnrelated);
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.sharedCodes).toContain("UGT-1103010205");
    expect(resolveMatchKind(good, industryCodeSimilarity(target.industryCode, sameCommodity.industryCode))).toBe("commodity");
  });

  it("行业相似按树前缀深度：同 L2 高于同 L1，不等同于 0", () => {
    const target = "UGT-I-06010709";
    expect(industryCodeSimilarity(target, "UGT-I-06010702")).toBeGreaterThan(
      industryCodeSimilarity(target, "UGT-I-06030102"),
    );
    expect(industryCodeSimilarity(target, "UGT-I-06030102")).toBeGreaterThan(0);
    expect(industryCodeSimilarity(target, "UGT-I-1302")).toBe(0);
    expect(industryCodeSimilarity(target, target)).toBe(1);
  });

  it("无品目/行业信号时产品文本重合兜底，原因归为同行业/同地区", () => {
    const target = input({ products: ["激光切割机", "金属折弯机"] });
    const candidate = input({ products: ["激光切割机", "激光焊接机"] });
    const result = computeSupplierSimilarity(target, candidate);
    expect(result.score).toBeGreaterThan(0);
    expect(resolveMatchKind(result, industryCodeSimilarity(null, null))).toBe("region");
  });
});
