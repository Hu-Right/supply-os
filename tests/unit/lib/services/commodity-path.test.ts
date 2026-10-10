/**
 * 品目路径派生测试 — 「所见即所得」的语义内核
 * @module tests/unit/lib/services/commodity-path.test.ts
 * @description 这些用例是整个设计的地基：选中哪一层就只命中哪一层。
 *              段级粗码（41000000）的路径必须停在 "41"，所以选族 4101 命中不到它——
 *              这不是漏召回，是招标方只说到段；反过来选段 41 必须命中它。
 *              护栏：不得做最短前缀压缩（minimalCommodityPrefixes 是子树 LIKE 语义），
 *              压缩会把 "4101" 收成 "41"，让按族筛选静默丢公告。
 */
import { describe, it, expect } from "vitest";
import {
  isUnspscEight,
  unspscAncestorPrefixes,
  mergeAncestorPrefixes,
  groupCodesOfCodes,
  toPathColumn,
  parsePathColumn,
} from "@/lib/services/commodity/path";

describe("unspscAncestorPrefixes — 两位一组、遇 00 即停", () => {
  it("完整品目码出满四级", () => {
    expect(unspscAncestorPrefixes("10101501")).toEqual(["10", "1010", "101015", "10101501"]);
    expect(unspscAncestorPrefixes("72151001")).toEqual(["72", "7215", "721510", "72151001"]);
  });

  it("段级粗码只出段（停在 2 位）", () => {
    expect(unspscAncestorPrefixes("41000000")).toEqual(["41"]);
    expect(unspscAncestorPrefixes("10000000")).toEqual(["10"]); // 段 10：尾零不能吃掉有效位
    expect(unspscAncestorPrefixes("72000000")).toEqual(["72"]);
    expect(unspscAncestorPrefixes("80000000")).toEqual(["80"]);
  });

  it("族级码出段+族", () => {
    expect(unspscAncestorPrefixes("10100000")).toEqual(["10", "1010"]);
    expect(unspscAncestorPrefixes("41010000")).toEqual(["41", "4101"]);
  });

  it("类级码出段+族+类", () => {
    expect(unspscAncestorPrefixes("10101500")).toEqual(["10", "1010", "101015"]);
    expect(unspscAncestorPrefixes("43050100")).toEqual(["43", "4305", "430501"]);
  });

  it("非法码返回空数组（不猜、不兜底）", () => {
    for (const bad of ["4101", "410100000", "ABCDEFGH", "", "1010150", null, undefined]) {
      expect(unspscAncestorPrefixes(bad as string)).toEqual([]);
      expect(isUnspscEight(bad)).toBe(false);
    }
  });
});

describe("mergeAncestorPrefixes — 多码合并去重，不压缩", () => {
  it("同族两品目合并后仍保留族前缀（等值命中需要每一层都在）", () => {
    expect(mergeAncestorPrefixes(["10101501", "10101502"])).toEqual([
      "10",
      "1010",
      "101015",
      "10101501",
      "10101502",
    ]);
  });

  it("粗码与细码并存：段级 41000000 + 族级 41010000 → 41 与 4101 都在", () => {
    expect(mergeAncestorPrefixes(["41000000", "41010000"])).toEqual(["41", "4101"]);
  });

  it("★ 反例护栏：不得把子孙前缀压成最短祖先", () => {
    const merged = mergeAncestorPrefixes(["10101501"]);
    expect(merged).toContain("101015");
    expect(merged).not.toEqual(["10"]);
  });

  it("排序稳定（先位数再字典），便于逐条对账与快照比对", () => {
    expect(mergeAncestorPrefixes(["72151001", "10000000"])).toEqual(["10", "72", "7215", "721510", "72151001"]);
  });

  it("空输入与全非法 → 空数组", () => {
    expect(mergeAncestorPrefixes([])).toEqual([]);
    expect(mergeAncestorPrefixes(["xx", "1"])).toEqual([]);
  });
});

describe("groupCodesOfCodes — 大类并集（OR 语义）", () => {
  it("跨大类公告出多个大类码，按码升序去重", () => {
    expect(groupCodesOfCodes(["72000000", "30000000"])).toEqual(["UGT-G-05", "UGT-G-11"]);
  });

  it("同类多段只出一个大类", () => {
    expect(groupCodesOfCodes(["41000000", "42010000", "51000000", "85000000"])).toEqual(["UGT-G-08"]);
  });

  it("未知段前缀直接丢弃（由对账脚本计数，不静默归入某个类）", () => {
    expect(groupCodesOfCodes(["99000000"])).toEqual([]);
  });
});

describe("toPathColumn / parsePathColumn — 写列与超长闸口", () => {
  it("逗号连接、无空格、可反解", () => {
    const s = toPathColumn(["41", "4101"]);
    expect(s).toBe("41,4101");
    expect(parsePathColumn(s)).toEqual(["41", "4101"]);
    expect(parsePathColumn("")).toEqual([]);
    expect(parsePathColumn(null)).toEqual([]);
  });

  it("超过上限抛错而非静默截断（截断=漏筛，必须停线）", () => {
    const huge = Array.from({ length: 400 }, (_, i) => String(10000000 + i * 7));
    expect(() => toPathColumn(huge)).toThrow(/超长/);
  });
});
