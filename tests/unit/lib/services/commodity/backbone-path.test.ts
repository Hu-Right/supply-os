/**
 * 骨架路径换算器单测
 *
 * 覆盖：四档换算、祖先全存与去重、换不出的码必须进 misses（不许静默丢）、
 *       族/段归属冲突必须抛错（不能"选一个"）、列超长必须拒写。
 */
import { describe, expect, it } from "vitest";
import {
  assertBackbonePathLength,
  buildBackboneIndex,
  chainOfNode,
  effectivePrefixOf,
  toBackbonePathColumn,
  type BackboneRow,
  type GroupSegmentRow,
} from "@/lib/services/commodity/backbone-path";

// 一棵够小的树：1 大类 / 1 中类 / 2 小类 / 2 子类 / 3 品目
const rows: BackboneRow[] = [
  { code: "UGT-B-01", parentCode: "", level: 1, unspscPrefix: null },
  { code: "UGT-B-0101", parentCode: "UGT-B-01", level: 2, unspscPrefix: null },
  { code: "UGT-B-010101", parentCode: "UGT-B-0101", level: 3, unspscPrefix: null },
  { code: "UGT-B-010102", parentCode: "UGT-B-0101", level: 3, unspscPrefix: null },
  { code: "UGT-B-01010101", parentCode: "UGT-B-010101", level: 4, unspscPrefix: "101015" },
  { code: "UGT-B-01010201", parentCode: "UGT-B-010102", level: 4, unspscPrefix: "101016" },
  { code: "UGT-B-0101010101", parentCode: "UGT-B-01010101", level: 5, unspscPrefix: "10101510" },
  { code: "UGT-B-0101010102", parentCode: "UGT-B-01010101", level: 5, unspscPrefix: "10101520" },
  { code: "UGT-B-0101020101", parentCode: "UGT-B-01010201", level: 5, unspscPrefix: "10101610" },
];
const segments: GroupSegmentRow[] = [{ segmentPrefix: "10", nodeCode: "UGT-B-01" }];
const idx = buildBackboneIndex(rows, segments);

describe("四档换算", () => {
  it("品目级 8 位全有效 → 命中 L5，且祖先全存", () => {
    const r = idx.pathOf(["10101510"]);
    expect(r.deepest).toEqual(["UGT-B-0101010101"]);
    expect(r.codes).toEqual(["UGT-B-01", "UGT-B-0101", "UGT-B-010101", "UGT-B-01010101", "UGT-B-0101010101"]);
    expect(r.tiers["品目级"]).toBe(1);
  });

  it("类级粗码（后两位 00）→ 命中 L4 子类", () => {
    const r = idx.pathOf(["10101500"]);
    expect(r.deepest).toEqual(["UGT-B-01010101"]);
    expect(r.tiers["类级"]).toBe(1);
    expect(r.misses).toEqual([]);
  });

  it("族级粗码：该族的两个子类分属两个小类 → 只能落 L2 中类", () => {
    const r = idx.pathOf(["10100000"]);
    expect(r.deepest).toEqual(["UGT-B-0101"]);
    expect(r.tiers["族级"]).toBe(1);
  });

  // 族 1020 在树里只有一个子类 ⇒ 族 ≡ 那个子类，落 L4 是结构事实不是推断
  it("族级粗码：该族在树里只有一个子类 → 落 L4 子类", () => {
    const one: BackboneRow[] = [
      ...rows,
      { code: "UGT-B-010103", parentCode: "UGT-B-0101", level: 3, unspscPrefix: null },
      { code: "UGT-B-01010301", parentCode: "UGT-B-010103", level: 4, unspscPrefix: "102015" },
    ];
    const i = buildBackboneIndex(one, segments);
    const hit = i.match("10200000");
    expect(hit?.row.code).toBe("UGT-B-01010301");
    expect(hit?.tier).toBe("族级");
    // 祖先链要齐：落 L4 也得带上 L3/L2/L1
    expect(i.pathOf(["10200000"]).codes).toEqual([
      "UGT-B-01", "UGT-B-0101", "UGT-B-010103", "UGT-B-01010301",
    ]);
  });

  // 族 1030 两个子类但同属一个小类 → 落 L3（比一刀切 L2 深一层，且仍可唯一证明）
  it("族级粗码：多个子类同属一个小类 → 落 L3 小类", () => {
    const two: BackboneRow[] = [
      ...rows,
      { code: "UGT-B-010103", parentCode: "UGT-B-0101", level: 3, unspscPrefix: null },
      { code: "UGT-B-01010301", parentCode: "UGT-B-010103", level: 4, unspscPrefix: "103015" },
      { code: "UGT-B-01010302", parentCode: "UGT-B-010103", level: 4, unspscPrefix: "103016" },
    ];
    const i = buildBackboneIndex(two, segments);
    expect(i.match("10300000")?.row.code).toBe("UGT-B-010103");
  });

  it("段级粗码（后六位 00）→ 命中 L1 大类（映射源是 group_segments）", () => {
    const r = idx.pathOf(["10000000"]);
    expect(r.deepest).toEqual(["UGT-B-01"]);
    expect(r.codes).toEqual(["UGT-B-01"]);
    expect(r.tiers["段级"]).toBe(1);
  });
});

describe("聚合与去重", () => {
  it("同支两个码共享祖先，节点不重复", () => {
    const r = idx.pathOf(["10101510", "10101520"]);
    expect(r.deepest).toEqual(["UGT-B-0101010101", "UGT-B-0101010102"]);
    expect(r.codes).toEqual(["UGT-B-01", "UGT-B-0101", "UGT-B-010101", "UGT-B-01010101", "UGT-B-0101010101", "UGT-B-0101010102"]);
  });

  it("粗码 + 细码混在一起，深层覆盖浅层但浅层节点仍在（任意一层都能等值筛到）", () => {
    const r = idx.pathOf(["10101500", "10101610"]);
    expect(r.codes).toContain("UGT-B-01010101");
    expect(r.codes).toContain("UGT-B-010102");
    expect(r.codes).toContain("UGT-B-01");
  });
});

describe("换不出归属的码", () => {
  it("树里没有的类前缀 → 进 misses，不静默丢", () => {
    const r = idx.pathOf(["99999900"]);
    expect(r.codes).toEqual([]);
    expect(r.deepest).toEqual([]);
    expect(r.misses).toEqual(["99999900"]);
  });

  it("非 8 位纯数字（野码/自研码/空值）→ 全部进 misses", () => {
    const r = idx.pathOf(["1010151", "101015100", "ABCDEFGH", "", "  "]);
    expect(r.codes).toEqual([]);
    expect(r.misses).toHaveLength(5);
  });

  it("尾零位置非法（类段有效但 L4 行不存在）→ misses", () => {
    expect(idx.match("10109900")).toBeNull();
  });
});

describe("冲突与拒写", () => {
  it("同一个族被挂到两个中类 → 直接抛错，不挑一个", () => {
    const bad: BackboneRow[] = [
      { code: "UGT-B-01", parentCode: "", level: 1, unspscPrefix: null },
      { code: "UGT-B-0101", parentCode: "UGT-B-01", level: 2, unspscPrefix: null },
      { code: "UGT-B-0102", parentCode: "UGT-B-01", level: 2, unspscPrefix: null },
      { code: "UGT-B-010101", parentCode: "UGT-B-0101", level: 3, unspscPrefix: null },
      { code: "UGT-B-010201", parentCode: "UGT-B-0102", level: 3, unspscPrefix: null },
      { code: "UGT-B-01010101", parentCode: "UGT-B-010101", level: 4, unspscPrefix: "101015" },
      { code: "UGT-B-01020101", parentCode: "UGT-B-010201", level: 4, unspscPrefix: "101016" }, // 同族 1010 挂到另一个中类
    ];
    expect(() => buildBackboneIndex(bad, segments)).toThrow(/1010/);
  });

  it("同一段挂到两个大类 → 抛错", () => {
    expect(() =>
      buildBackboneIndex(rows, [
        { segmentPrefix: "10", nodeCode: "UGT-B-01" },
        { segmentPrefix: "10", nodeCode: "UGT-B-02" },
      ]),
    ).toThrow(/10/);
  });

  it("列值拼接与超长拒写", () => {
    expect(toBackbonePathColumn(["UGT-B-01", "UGT-B-0101"])).toBe("UGT-B-01,UGT-B-0101");
    expect(() => assertBackbonePathLength("x".repeat(1_000_001), 42)).toThrow(/超长/);
    expect(assertBackbonePathLength("x".repeat(1000), 42)).toHaveLength(1000);
  });
});

describe("有效前缀与祖先链纯函数", () => {
  it("effectivePrefixOf：四档有效前缀与形制不符", () => {
    expect(effectivePrefixOf("10101510")).toBe("10101510");
    expect(effectivePrefixOf("10101500")).toBe("101015");
    expect(effectivePrefixOf("10100000")).toBe("1010");
    expect(effectivePrefixOf("10000000")).toBe("10");
    expect(effectivePrefixOf("00000000")).toBeNull();
    expect(effectivePrefixOf("1010151")).toBeNull();
    expect(effectivePrefixOf("")).toBeNull();
  });

  it("chainOfNode：节点码纯切片，L5 给五级、L1 只给自己", () => {
    expect(chainOfNode("UGT-B-0702010204")).toEqual([
      "UGT-B-07", "UGT-B-0702", "UGT-B-070201", "UGT-B-07020102", "UGT-B-0702010204",
    ]);
    expect(chainOfNode("UGT-B-07")).toEqual(["UGT-B-07"]);
  });
});
