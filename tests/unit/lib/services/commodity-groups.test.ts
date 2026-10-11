/**
 * 品目大类常量自检 — 32 类与 58 段归属的地基
 * @module tests/unit/lib/services/commodity-groups.test.ts
 * @description 除了断言「现在是对的」，还用本模块导出的校验函数跑破坏样本，
 *              证明每条规则真的会报错（否则「校验通过」只是校验失效）。
 *              段归属 1:1 是筛选与权益墙共用一套口径的前提：一旦一段挂两类，
 *              同一公告会出现两个答案。
 */
import { describe, it, expect } from "vitest";
import {
  COMMODITY_GROUPS,
  COMMODITY_SEGMENT_PREFIXES,
  groupCodeOfUnspscPrefix,
  groupCodeOfUnspscCode,
  validateCommodityGroups,
} from "@/lib/services/commodity/groups";

describe("COMMODITY_GROUPS — 32 大类与 58 段归属", () => {
  it("自校验全绿", () => {
    expect(validateCommodityGroups()).toEqual([]);
  });

  it("恰好 32 类、58 个不重复段前缀", () => {
    expect(COMMODITY_GROUPS).toHaveLength(32);
    expect(COMMODITY_SEGMENT_PREFIXES).toHaveLength(58);
    expect(new Set(COMMODITY_SEGMENT_PREFIXES).size).toBe(58);
  });

  it("码表可反查：段 72 → 建筑施工，段 92 → 公共安全，段 41 → 仪器", () => {
    expect(groupCodeOfUnspscPrefix("72")).toBe("UGT-G-11");
    expect(groupCodeOfUnspscPrefix("92")).toBe("UGT-G-09");
    expect(groupCodeOfUnspscPrefix("41")).toBe("UGT-G-18");
    expect(groupCodeOfUnspscCode("41010000")).toBe("UGT-G-18");
  });

  it("医疗四拆：器械 42 / 药品 51 / 服务 85 / 仪器 41 必须各自成类", () => {
    const codes = ["42", "51", "85", "41"].map((p) => groupCodeOfUnspscPrefix(p));
    expect(new Set(codes).size).toBe(4);
  });

  it("未知前缀与非法长度一律 null（不得兜底成某个类）", () => {
    for (const bad of ["99", "7", "721", "", "GG", "AB", null, undefined]) {
      expect(groupCodeOfUnspscPrefix(bad as string)).toBeNull();
    }
    expect(groupCodeOfUnspscCode("4101")).toBeNull();
  });

  it("G13 不含 80 与 92（拆类回归：80 已拆为 G16，92 只属 G09）", () => {
    const g13 = COMMODITY_GROUPS.find((g) => g.code === "UGT-G-13")!;
    expect(g13.prefixes).not.toContain("92");
    expect(g13.prefixes).not.toContain("80");
    expect(g13.prefixes).toEqual(["83", "93", "94"]);
    expect(groupCodeOfUnspscPrefix("80")).toBe("UGT-G-16");
  });

  it("sort 从 1 连续递增到 32（chip 顺序稳定，不随公告量波动）", () => {
    expect(COMMODITY_GROUPS.map((g) => g.sort)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
  });
});

describe("validateCommodityGroups — 规则本身有效（正反例）", () => {
  it("一段挂两类 → CG3 报错", () => {
    expect(
      validateCommodityGroups([
        { code: "UGT-G-01", nameZh: "甲", prefixes: ["72"] },
        { code: "UGT-G-02", nameZh: "乙", prefixes: ["72"] },
      ]),
    ).toContain("CG3 段 72 重复归属：UGT-G-01 vs UGT-G-02");
  });

  it("名称为空 → CG4 报错；码形制非法 → CG1 报错", () => {
    const p = validateCommodityGroups([{ code: "G01", nameZh: "  ", prefixes: ["10"] }]);
    expect(p).toContain("CG4 G01 的 name_zh 为空");
    expect(p.some((x) => x.startsWith("CG1 大类码形制非法"))).toBe(true);
  });

  it("段前缀形制非法 → CG2 报错", () => {
    expect(validateCommodityGroups([{ code: "UGT-G-01", nameZh: "甲", prefixes: ["7", "abc"] }])).toEqual(
      expect.arrayContaining(["CG2 UGT-G-01 段前缀形制非法：7", "CG2 UGT-G-01 段前缀形制非法：abc"]),
    );
  });
});
