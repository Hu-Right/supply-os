/**
 * 骨架路径换算器单测
 *
 * 覆盖：四档换算、祖先全存与去重、换不出的码必须进 misses（不许静默丢）、
 *       族/段归属冲突必须抛错（不能"选一个"）、列超长必须拒写。
 */
import { describe, expect, it } from "vitest";
import {
  assertBackbonePathLength,
  backboneNodeLevel,
  buildBackboneIndex,
  chainOfNode,
  deriveSegmentRows,
  effectivePrefixOf,
  fromBackbonePathColumn,
  normalizeBackboneNodeKey,
  padUnspscCode,
  rootNodes,
  toBackbonePathColumn,
  type BackboneRow,
  type GroupSegmentRow,
} from "@/lib/services/commodity/backbone-path";

// 一棵够小的树：1 大类 / 1 中类 / 2 小类 / 2 子类 / 3 品目
const rows: BackboneRow[] = [
  { code: "UGT-01", parentCode: "", level: 1, unspscPrefix: null },
  { code: "UGT-0101", parentCode: "UGT-01", level: 2, unspscPrefix: null },
  { code: "UGT-010101", parentCode: "UGT-0101", level: 3, unspscPrefix: null },
  { code: "UGT-010102", parentCode: "UGT-0101", level: 3, unspscPrefix: null },
  { code: "UGT-01010101", parentCode: "UGT-010101", level: 4, unspscPrefix: "101015" },
  { code: "UGT-01010201", parentCode: "UGT-010102", level: 4, unspscPrefix: "101016" },
  { code: "UGT-0101010101", parentCode: "UGT-01010101", level: 5, unspscPrefix: "10101510" },
  { code: "UGT-0101010102", parentCode: "UGT-01010101", level: 5, unspscPrefix: "10101520" },
  { code: "UGT-0101020101", parentCode: "UGT-01010201", level: 5, unspscPrefix: "10101610" },
];
const segments: GroupSegmentRow[] = [{ segmentPrefix: "10", nodeCode: "UGT-01" }];
const idx = buildBackboneIndex(rows, segments);

describe("四档换算", () => {
  it("品目级 8 位全有效 → 命中 L5，且祖先全存", () => {
    const r = idx.pathOf(["10101510"]);
    expect(r.deepest).toEqual(["UGT-0101010101"]);
    expect(r.codes).toEqual(["UGT-01", "UGT-0101", "UGT-010101", "UGT-01010101", "UGT-0101010101"]);
    expect(r.tiers["品目级"]).toBe(1);
  });

  it("类级粗码（后两位 00）→ 命中 L4 子类", () => {
    const r = idx.pathOf(["10101500"]);
    expect(r.deepest).toEqual(["UGT-01010101"]);
    expect(r.tiers["类级"]).toBe(1);
    expect(r.misses).toEqual([]);
  });

  it("族级粗码：该族的两个子类分属两个小类 → 只能落 L2 中类", () => {
    const r = idx.pathOf(["10100000"]);
    expect(r.deepest).toEqual(["UGT-0101"]);
    expect(r.tiers["族级"]).toBe(1);
  });

  // 族 1020 在树里只有一个子类 ⇒ 族 ≡ 那个子类，落 L4 是结构事实不是推断
  it("族级粗码：该族在树里只有一个子类 → 落 L4 子类", () => {
    const one: BackboneRow[] = [
      ...rows,
      { code: "UGT-010103", parentCode: "UGT-0101", level: 3, unspscPrefix: null },
      { code: "UGT-01010301", parentCode: "UGT-010103", level: 4, unspscPrefix: "102015" },
    ];
    const i = buildBackboneIndex(one, segments);
    const hit = i.match("10200000");
    expect(hit?.row.code).toBe("UGT-01010301");
    expect(hit?.tier).toBe("族级");
    // 祖先链要齐：落 L4 也得带上 L3/L2/L1
    expect(i.pathOf(["10200000"]).codes).toEqual([
      "UGT-01", "UGT-0101", "UGT-010103", "UGT-01010301",
    ]);
  });

  // 族 1030 两个子类但同属一个小类 → 落 L3（比一刀切 L2 深一层，且仍可唯一证明）
  it("族级粗码：多个子类同属一个小类 → 落 L3 小类", () => {
    const two: BackboneRow[] = [
      ...rows,
      { code: "UGT-010103", parentCode: "UGT-0101", level: 3, unspscPrefix: null },
      { code: "UGT-01010301", parentCode: "UGT-010103", level: 4, unspscPrefix: "103015" },
      { code: "UGT-01010302", parentCode: "UGT-010103", level: 4, unspscPrefix: "103016" },
    ];
    const i = buildBackboneIndex(two, segments);
    expect(i.match("10300000")?.row.code).toBe("UGT-010103");
  });

  it("段级粗码（后六位 00）→ 命中 L1 大类（映射源是 group_segments）", () => {
    const r = idx.pathOf(["10000000"]);
    expect(r.deepest).toEqual(["UGT-01"]);
    expect(r.codes).toEqual(["UGT-01"]);
    expect(r.tiers["段级"]).toBe(1);
  });
});

describe("聚合与去重", () => {
  it("同支两个码共享祖先，节点不重复", () => {
    const r = idx.pathOf(["10101510", "10101520"]);
    expect(r.deepest).toEqual(["UGT-0101010101", "UGT-0101010102"]);
    expect(r.codes).toEqual(["UGT-01", "UGT-0101", "UGT-010101", "UGT-01010101", "UGT-0101010101", "UGT-0101010102"]);
  });

  it("粗码 + 细码混在一起，深层覆盖浅层但浅层节点仍在（任意一层都能等值筛到）", () => {
    const r = idx.pathOf(["10101500", "10101610"]);
    expect(r.codes).toContain("UGT-01010101");
    expect(r.codes).toContain("UGT-010102");
    expect(r.codes).toContain("UGT-01");
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

describe("入参归一：成对的 2/4/6 位截断码也认（兴趣码表实测 357/830 条是这种）", () => {
  it("padUnspscCode：只有偶数位 ≤ 8 的纯数字能补零，奇数位与超 8 位一律 null", () => {
    expect(padUnspscCode("10")).toBe("10000000");
    expect(padUnspscCode("1010")).toBe("10100000");
    expect(padUnspscCode("101015")).toBe("10101500");
    expect(padUnspscCode(" 1010 ")).toBe("10100000");
    expect(padUnspscCode("10101510")).toBe("10101510");
    expect(padUnspscCode("101")).toBeNull(); // 奇数位不是合法的「两位一级」
    expect(padUnspscCode("101015100")).toBeNull(); // 9 位不猜
    expect(padUnspscCode("1010151000")).toBeNull(); // 10 位也不猜（那是另一个编号体系）
    expect(padUnspscCode("10A0")).toBeNull();
    expect(padUnspscCode("")).toBeNull();
    expect(padUnspscCode(null)).toBeNull();
  });

  it("截断码走同一套四档规则：段→L1、族→最深可证实唯一、类→L4 子类", () => {
    expect(idx.pathOf(["10"]).codes).toEqual(["UGT-01"]); // 段级
    expect(idx.pathOf(["1010"]).codes).toEqual(["UGT-01", "UGT-0101"]); // 族级（本树里该族跨两个小类⇒落 L2）
    expect(idx.match("101015")?.row.code).toBe("UGT-01010101"); // 类前缀等值命中 L4
    expect(idx.match("101015")?.tier).toBe("类级");
  });

  it("8 位码的结果不因放宽而改变（已回填的 353,875 行公告归属不漂）", () => {
    expect(idx.pathOf(["10101500"]).codes).toEqual(idx.pathOf(["101015"]).codes);
    expect(idx.pathOf(["10100000"]).codes).toEqual(idx.pathOf(["1010"]).codes);
    expect(idx.pathOf(["10000000"]).codes).toEqual(idx.pathOf(["10"]).codes);
  });
});

describe("rootNodes：多值 OR 谓词的最浅覆盖集", () => {
  it("集合里有祖先就把深层去掉（列值祖先全存 ⇒ 并集不变）", () => {
    expect(rootNodes(["UGT-01", "UGT-0102", "UGT-010203"])).toEqual(["UGT-01"]);
    expect(rootNodes(["UGT-0102", "UGT-010203"])).toEqual(["UGT-0102"]);
  });

  it("不相关的节点全部保留，结果按码序且可复现", () => {
    const a = rootNodes(["UGT-0203", "UGT-0102", "UGT-0102", "UGT-05"]);
    expect(a).toEqual(["UGT-0102", "UGT-0203", "UGT-05"]);
    expect(rootNodes(a)).toEqual(a); // 已压集的集合再过一次不变
  });

  it("脏 token 不进集（形制判定只认 backboneNodeLevel）", () => {
    expect(rootNodes(["UGT-XY", "42101503", "", "UGT-01"])).toEqual(["UGT-01"]);
  });

  it("兄弟不互相覆盖：同父不同子两个都留", () => {
    expect(rootNodes(["UGT-0102", "UGT-0103"])).toEqual(["UGT-0102", "UGT-0103"]);
  });
});

describe("冲突与拒写", () => {
  it("族跨两个中类但同大类 → 落大类 L1，不再抛错（2026-10-13 语义重挂后的合法形态）", () => {
    const crossL2: BackboneRow[] = [
      { code: "UGT-01", parentCode: "", level: 1, unspscPrefix: null },
      { code: "UGT-0101", parentCode: "UGT-01", level: 2, unspscPrefix: null },
      { code: "UGT-0102", parentCode: "UGT-01", level: 2, unspscPrefix: null },
      { code: "UGT-010101", parentCode: "UGT-0101", level: 3, unspscPrefix: null },
      { code: "UGT-010201", parentCode: "UGT-0102", level: 3, unspscPrefix: null },
      { code: "UGT-01010101", parentCode: "UGT-010101", level: 4, unspscPrefix: "101015" },
      { code: "UGT-01020101", parentCode: "UGT-010201", level: 4, unspscPrefix: "101016" }, // 同族 1010 跨中类
    ];
    const ix = buildBackboneIndex(crossL2, segments);
    const hit = ix.match("10100000");
    expect(hit?.row.code).toBe("UGT-01");
    expect(hit?.row.level).toBe(1);
  });

  it("同一个族被挂到两个大类 → 直接抛错，不挑一个", () => {
    const bad: BackboneRow[] = [
      { code: "UGT-01", parentCode: "", level: 1, unspscPrefix: null },
      { code: "UGT-02", parentCode: "", level: 1, unspscPrefix: null },
      { code: "UGT-0101", parentCode: "UGT-01", level: 2, unspscPrefix: null },
      { code: "UGT-0201", parentCode: "UGT-02", level: 2, unspscPrefix: null },
      { code: "UGT-010101", parentCode: "UGT-0101", level: 3, unspscPrefix: null },
      { code: "UGT-020101", parentCode: "UGT-0201", level: 3, unspscPrefix: null },
      { code: "UGT-01010101", parentCode: "UGT-010101", level: 4, unspscPrefix: "101015" },
      { code: "UGT-02010101", parentCode: "UGT-020101", level: 4, unspscPrefix: "101016" }, // 同族 1010 挂到另一个大类
    ];
    expect(() => buildBackboneIndex(bad, segments)).toThrow(/1010/);
  });

  it("同一段挂到两个大类 → 抛错", () => {
    expect(() =>
      buildBackboneIndex(rows, [
        { segmentPrefix: "10", nodeCode: "UGT-01" },
        { segmentPrefix: "10", nodeCode: "UGT-02" },
      ]),
    ).toThrow(/10/);
  });

  it("列值拼接与超长拒写", () => {
    expect(toBackbonePathColumn(["UGT-01", "UGT-0101"])).toBe("UGT-01,UGT-0101");
    expect(() => assertBackbonePathLength("x".repeat(1_000_001), 42)).toThrow(/超长/);
    expect(assertBackbonePathLength("x".repeat(1000), 42)).toHaveLength(1000);
  });
});

describe("段映射的常量兜底", () => {
  /**
   * 背景（2026-10-12 现网实测）：骨架树重建后 85 段的 L4 行整族没了，段→大类「只从树反推」就断，
   * 导致 `85000000` 这类段级粗码换不出归属、连带 1,159 条公告（活跃 272）归属被清空。
   * 而段→大类的口径本身在 `COMMODITY_GROUPS` 常量里（ADR-0008/0009：大类维表退役后口径只剩常量），
   * 树 L1 又恰好每个大类一行 ⇒ 常量可以直接指到一个真实存在的树节点，不是造节点。
   * 铁律：**树反推优先**，常量只补树没推出来的那段，两边打架不能静默偏向常量。
   */
  type TreeRow = { code: string; level: number; unspsc_prefix: string | null; group_code: string };
  // 常量实际口径：段 10 → UGT-G-01、段 85 → UGT-G-25（医疗与卫生服务）
  const base: TreeRow[] = [
    { code: "UGT-01", level: 1, unspsc_prefix: null, group_code: "UGT-G-01" },
    { code: "UGT-25", level: 1, unspsc_prefix: null, group_code: "UGT-G-25" },
    { code: "UGT-01010101", level: 4, unspsc_prefix: "101015", group_code: "UGT-G-01" },
  ];

  it("85 段在树里没有 L4 行，但常量把它归到 G-25、树里有 G-25 的 L1 行 → 85 段落向那个 L1", () => {
    expect(deriveSegmentRows(base)).toEqual(
      expect.arrayContaining([{ segmentPrefix: "85", nodeCode: "UGT-25" }]),
    );
  });

  it("树里该段有 L4 行时以树为准，常量不得覆盖（哪怕常量说它属于另一个大类）", () => {
    const withTree85: TreeRow[] = [
      ...base,
      { code: "UGT-01010103", level: 4, unspsc_prefix: "851015", group_code: "UGT-G-01" },
    ];
    // 常量说 85 属 G-25，树反推说属 G-01（对应 L1 = UGT-01）：取树，且只出一条
    expect(deriveSegmentRows(withTree85).filter((s) => s.segmentPrefix === "85")).toEqual([
      { segmentPrefix: "85", nodeCode: "UGT-01" },
    ]);
  });

  it("常量归的大类在树里没有 L1 行 → 该段不落点，也不抛（沿用「L1 缺席则段不落点」的既有语义）", () => {
    const noL1 = base.filter((r) => r.code !== "UGT-25");
    const segs = deriveSegmentRows(noL1);
    expect(segs.some((s) => s.segmentPrefix === "85")).toBe(false);
    // 树反推那半边不受影响；而同一大类的其它段（常量里 70 也属 G-01）本就该由兜底补上
    expect(segs.find((s) => s.segmentPrefix === "10")).toEqual({ segmentPrefix: "10", nodeCode: "UGT-01" });
    expect(segs.find((s) => s.segmentPrefix === "70")).toEqual({ segmentPrefix: "70", nodeCode: "UGT-01" });
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
    // 截断写法与定长写法得到有效前缀（放宽入参不改变已有语义）
    expect(effectivePrefixOf("101015")).toBe("101015");
    expect(effectivePrefixOf("1010")).toBe("1010");
    expect(effectivePrefixOf("10")).toBe("10");
    expect(effectivePrefixOf("101015100")).toBeNull();
  });

  it("chainOfNode：节点码纯切片，L5 给五级、L1 只给自己", () => {
    expect(chainOfNode("UGT-0702010204")).toEqual([
      "UGT-07", "UGT-0702", "UGT-070201", "UGT-07020102", "UGT-0702010204",
    ]);
    expect(chainOfNode("UGT-07")).toEqual(["UGT-07"]);
  });

  it("fromBackbonePathColumn：与 toBackbonePathColumn 往返，NULL/空串/野 token 不炸", () => {
    const codes = ["UGT-01", "UGT-0101", "UGT-01010101"];
    expect(fromBackbonePathColumn(toBackbonePathColumn(codes))).toEqual(codes);
    expect(fromBackbonePathColumn(null)).toEqual([]);
    expect(fromBackbonePathColumn("")).toEqual([]);
    // 去重 + 丢非树码（旧 UGT-C- 尾巴、空段）
    expect(fromBackbonePathColumn("UGT-01,UGT-01,,UGT-C-0702")).toEqual(["UGT-01"]);
  });

  // 形制判定必须比「startsWith(前缀)」紧：否则脏 token 会被当成合法层级使，
  // 两个同样脏的码直接就能得出一条不存在的相似公告
  it("backboneNodeLevel：只认前缀 + 偶数位数字，其它一律 0", () => {
    expect(backboneNodeLevel("UGT-07")).toBe(1);
    expect(backboneNodeLevel("UGT-0702010204")).toBe(5);
    expect(backboneNodeLevel("UGT-XY")).toBe(0); // 非数字
    expect(backboneNodeLevel("UGT-0")).toBe(0); // 奇数位
    expect(backboneNodeLevel("UGT-010101010101")).toBe(0); // 超 10 位
    expect(backboneNodeLevel(" UGT-07 ")).toBe(0); // 带空格：宁判非法
    // 2026-10-13 改码前的旧形制（带面别字）必须判非法：否则存量旧码会被当成合法层级使
    expect(backboneNodeLevel("UGT-B-07")).toBe(0);
    expect(backboneNodeLevel(null)).toBe(0);
    expect(backboneNodeLevel(7)).toBe(0);
  });

  it("fromBackbonePathColumn 丢弃形制不符的脏 token", () => {
    expect(fromBackbonePathColumn("UGT-01,UGT-XY,UGT-0, ,UGT-0101")).toEqual(["UGT-01", "UGT-0101"]);
  });

  // 旧外链兼容面只此一处：只换前缀，位数一位不动（旧 UGT-B-0102 → 新 UGT-0102 同层）。
  // 不钉住它，下次改码又会变成“入口归一了、下游不认”或者反过来。
  it("normalizeBackboneNodeKey：入口层认旧码，现行码幂等，脏值不猜", () => {
    expect(normalizeBackboneNodeKey("UGT-B-07")).toBe("UGT-07");
    expect(normalizeBackboneNodeKey("UGT-B-0702010204")).toBe("UGT-0702010204");
    expect(normalizeBackboneNodeKey("UGT-07")).toBe("UGT-07"); // 现行码原样
    expect(normalizeBackboneNodeKey("UGT-XY")).toBe("UGT-XY"); // 不归一脏值，交给形制判定拒收
    expect(normalizeBackboneNodeKey(null)).toBe("");
    // 归一之后必须能被形制判定接住：入口 → 判定的接力不能断
    expect(backboneNodeLevel(normalizeBackboneNodeKey("UGT-B-0702"))).toBe(2);
  });
});
