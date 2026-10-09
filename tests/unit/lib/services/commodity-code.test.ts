/**
 * 品目码制工具测试 — 品目面顺排码的地基假设
 * @module tests/unit/lib/services/commodity-code.test.ts
 * @description 码长即层级（2/4/6/8/10），父码=自身码去末两级；门禁 check:taxonomy 的 C 段
 *              把这条钉成不变量。本测试固定推导结果：一旦码制改动，这里先红，
 *              而不是让未来的品目子树筛选静默返回错子集。
 */
import { describe, it, expect } from "vitest";
import {
  isCommodityCode,
  commodityLevelOf,
  commodityAncestorCodes,
  commoditySubtreeLike,
  minimalCommodityPrefixes,
  sanitizeCommodityCode,
} from "@/lib/services/commodity-code";

describe("isCommodityCode / sanitizeCommodityCode — 外部输入先验", () => {
  it("2/4/6/8/10 位偶数数字都是合法品目码", () => {
    for (const c of ["UGT-C-01", "UGT-C-0101", "UGT-C-010101", "UGT-C-01010101", "UGT-C-0101010101"]) {
      expect(isCommodityCode(c)).toBe(true);
      expect(sanitizeCommodityCode(c)).toBe(c);
    }
  });

  it("行业面码、奇数位、超长、非数字、注入串一律判非法（清洗为空串）", () => {
    for (const bad of [
      "UGT-I-0326",
      "UGT-C-0",
      "UGT-C-010101010101",
      "UGT-C-AB",
      "UGT-C-01' OR 1=1--",
      "",
      null,
      undefined,
    ]) {
      expect(isCommodityCode(bad)).toBe(false);
      expect(sanitizeCommodityCode(bad as string)).toBe("");
    }
  });

  it("前后空白先裁再判", () => {
    expect(sanitizeCommodityCode("  UGT-C-0101  ")).toBe("UGT-C-0101");
  });
});

describe("commodityLevelOf — 码长唯一映射层级（无歧义、无需回表）", () => {
  it("五层各由码长判定", () => {
    expect(commodityLevelOf("UGT-C-01")).toBe("segment");
    expect(commodityLevelOf("UGT-C-0101")).toBe("family");
    expect(commodityLevelOf("UGT-C-010101")).toBe("class");
    expect(commodityLevelOf("UGT-C-01010101")).toBe("commodity");
    expect(commodityLevelOf("UGT-C-0101010101")).toBe("extension");
  });

  it("非法码返回 null", () => {
    expect(commodityLevelOf("UGT-I-01")).toBeNull();
    expect(commodityLevelOf("UGT-C-010101010101")).toBeNull();
  });
});

describe("commodityAncestorCodes / commoditySubtreeLike — 路径推导", () => {
  it("品目码给出 板块/族/类/自身 四级，首项板块、末项自身", () => {
    expect(commodityAncestorCodes("UGT-C-01010101")).toEqual([
      "UGT-C-01",
      "UGT-C-0101",
      "UGT-C-010101",
      "UGT-C-01010101",
    ]);
  });

  it("自研码给出五级、末项自身", () => {
    expect(commodityAncestorCodes("UGT-C-0101010101")).toEqual([
      "UGT-C-01",
      "UGT-C-0101",
      "UGT-C-010101",
      "UGT-C-01010101",
      "UGT-C-0101010101",
    ]);
  });

  it("板块码只有自己一项", () => {
    expect(commodityAncestorCodes("UGT-C-01")).toEqual(["UGT-C-01"]);
  });

  it("非法码返回空数组", () => {
    expect(commodityAncestorCodes("UGT-I-01")).toEqual([]);
  });

  it("子树前缀=码本身加通配符", () => {
    expect(commoditySubtreeLike("UGT-C-0101")).toBe("UGT-C-0101%");
  });
});

describe("minimalCommodityPrefixes — 最短前缀去重", () => {
  it("祖先已入选时丢掉子孙码", () => {
    expect(minimalCommodityPrefixes(["UGT-C-01010101", "UGT-C-0101", "UGT-C-01"])).toEqual(["UGT-C-01"]);
  });

  it("入参顺序无关，不同分支各自保留", () => {
    expect(minimalCommodityPrefixes(["UGT-C-0201", "UGT-C-01", "UGT-C-02"])).toEqual(["UGT-C-01", "UGT-C-02"]);
  });

  it("非法码先丢再算", () => {
    expect(minimalCommodityPrefixes(["UGT-C-01' OR 1=1--", "UGT-I-01", "", "UGT-C-05"])).toEqual(["UGT-C-05"]);
  });

  it("空集合法", () => {
    expect(minimalCommodityPrefixes([])).toEqual([]);
  });
});
